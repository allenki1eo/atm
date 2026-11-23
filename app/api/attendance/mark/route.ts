import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/sms";
import { formatCurrency, getTodayDate } from "@/lib/utils";
import { getWorkHoursSettings } from "@/lib/attendance-settings";
import {
  assertCheckOutAfterCheckIn,
  resolveStatusWithLateRule,
  validateAttendanceTimes,
  type AttendanceStatus,
} from "@/lib/attendance-times";

const validStatuses: AttendanceStatus[] = ["present", "absent", "late", "half_day", "leave"];

function asStatus(value: unknown): AttendanceStatus | null {
  return typeof value === "string" && validStatuses.includes(value as AttendanceStatus)
    ? (value as AttendanceStatus)
    : null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { employee_id, date, notes, force } = body;
  const explicitStatus = asStatus(body.status);

  if (!employee_id || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (body.status != null && body.status !== "" && !explicitStatus) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const adminOverride = force === true && role === "admin";

  const timesResult = validateAttendanceTimes({
    date,
    checkIn: Object.prototype.hasOwnProperty.call(body, "check_in_at") ? body.check_in_at : undefined,
    checkOut: Object.prototype.hasOwnProperty.call(body, "check_out_at") ? body.check_out_at : undefined,
  });
  if (!timesResult.ok) {
    return NextResponse.json({ error: timesResult.error }, { status: 400 });
  }

  const existing = await db.execute({
    sql: `SELECT id, is_locked, status, check_in_at, check_out_at
          FROM attendance WHERE employee_id = ? AND date = ?`,
    args: [employee_id, date],
  });

  const existingRow = existing.rows[0] as unknown as
    | {
        id: string;
        is_locked: number;
        status: AttendanceStatus;
        check_in_at: string | null;
        check_out_at: string | null;
      }
    | undefined;

  if (existingRow?.is_locked && !adminOverride) {
    return NextResponse.json({ error: "Attendance is locked for this date" }, { status: 403 });
  }

  const nextCheckIn = timesResult.checkInProvided
    ? (timesResult.check_in_at ?? null)
    : (existingRow?.check_in_at ?? null);
  const nextCheckOut = timesResult.checkOutProvided
    ? (timesResult.check_out_at ?? null)
    : (existingRow?.check_out_at ?? null);

  const orderError = assertCheckOutAfterCheckIn(nextCheckIn, nextCheckOut);
  if (orderError) {
    return NextResponse.json({ error: orderError }, { status: 400 });
  }

  const settings = await getWorkHoursSettings();
  const resolved = resolveStatusWithLateRule({
    explicitStatus,
    currentStatus: existingRow?.status ?? null,
    checkInIso: nextCheckIn,
    settings,
  });

  const status = resolved.status;
  if (!status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const timesChanged =
    timesResult.checkInProvided || timesResult.checkOutProvided;
  const userId = session.user.id!;

  if (existingRow) {
    const sets = ["status = ?", "marked_by = ?", "marked_at = CURRENT_TIMESTAMP"];
    const args: Array<string | null> = [status, userId];
    if (body.notes !== undefined) {
      sets.push("notes = ?");
      args.push(notes ?? null);
    }
    if (timesChanged) {
      sets.push("check_in_at = ?", "check_out_at = ?", "times_updated_by = ?", "times_updated_at = CURRENT_TIMESTAMP");
      args.push(nextCheckIn, nextCheckOut, userId);
    }
    args.push(existingRow.id);
    await db.execute({
      sql: `UPDATE attendance SET ${sets.join(", ")} WHERE id = ?`,
      args,
    });
  } else {
    await db.execute({
      sql: `INSERT INTO attendance
              (id, employee_id, date, status, marked_by, notes, check_in_at, check_out_at, times_updated_by, times_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${timesChanged ? "CURRENT_TIMESTAMP" : "NULL"})`,
      args: [
        nanoid(),
        employee_id,
        date,
        status,
        userId,
        notes ?? null,
        nextCheckIn,
        nextCheckOut,
        timesChanged ? userId : null,
      ],
    });
  }

  // Calculate month totals for SMS
  const today = getTodayDate();
  const monthStart = today.substring(0, 8) + "01";

  const [monthAttendance, employee] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as days FROM attendance
            WHERE employee_id = ? AND date >= ? AND date <= ? AND status IN ('present', 'late', 'half_day')`,
      args: [employee_id, monthStart, today],
    }),
    db.execute({
      sql: "SELECT name, phone, daily_rate, type FROM employees WHERE id = ?",
      args: [employee_id],
    }),
  ]);

  const daysWorked = (monthAttendance.rows[0] as unknown as { days: number }).days;
  const emp = employee.rows[0] as unknown as { name: string; phone: string; daily_rate: number; type: string };

  if (emp && emp.phone) {
    const grossCents = daysWorked * emp.daily_rate;
    const message = smsTemplates.attendanceMarked(
      emp.name,
      status,
      date,
      daysWorked,
      formatCurrency(grossCents)
    );

    sendSMS(emp.phone, message, {
      sentBy: session.user.id ?? null,
      source: "attendance_mark",
    }).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    status,
    date,
    employee_id,
    check_in_at: nextCheckIn,
    check_out_at: nextCheckOut,
    late_by_rule: resolved.lateByRule,
    auto_applied_late: resolved.autoAppliedLate,
  });
}

// Bulk mark attendance
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { employee_ids, date, status } = body;

  if (!employee_ids?.length || !date || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const results = [];
  for (const employee_id of employee_ids) {
    const existing = await db.execute({
      sql: "SELECT id, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
      args: [employee_id, date],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0] as unknown as { id: string; is_locked: number };
      if (!row.is_locked) {
        await db.execute({
          sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE id = ?",
          args: [status, session.user.id!, row.id],
        });
      }
    } else {
      await db.execute({
        sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by) VALUES (?, ?, ?, ?, ?)",
        args: [nanoid(), employee_id, date, status, session.user.id!],
      });
    }
    results.push(employee_id);
  }

  return NextResponse.json({ success: true, updated: results.length });
}
