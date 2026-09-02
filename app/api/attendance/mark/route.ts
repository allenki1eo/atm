import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency, getTodayDate } from "@/lib/utils";
import { apiHandler } from "@/lib/api-handler";

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { employee_id, date, status, notes, force } = body;

  if (!employee_id || !date || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validStatuses = ["present", "absent", "late", "half_day"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const adminOverride = force === true && role === "admin";

  // Check if locked
  const existing = await db.execute({
    sql: "SELECT id, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
    args: [employee_id, date],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as unknown as { id: string; is_locked: number };
    if (row.is_locked && !adminOverride) {
      return NextResponse.json({ error: "Attendance is locked for this date" }, { status: 403 });
    }

    await db.execute({
      sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?",
      args: [status, session.user.id!, notes ?? null, row.id],
    });
  } else {
    await db.execute({
      sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by, notes) VALUES (?, ?, ?, ?, ?, ?)",
      args: [nanoid(), employee_id, date, status, session.user.id!, notes ?? null],
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

  return NextResponse.json({ success: true, status, date, employee_id });
}

// Bulk mark attendance
async function _PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

export const POST = apiHandler(_POST);
export const PUT = apiHandler(_PUT);
