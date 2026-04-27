import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supervisorCanAccessEmployee } from "@/lib/authorization";
import { nanoid } from "nanoid";
import { sendSMS } from "@/lib/at";
import { formatDate } from "@/lib/utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden: HR, admin, or supervisor only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, review_note } = body;

  if (!status || !["approved", "denied"].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'approved' or 'denied'" },
      { status: 400 }
    );
  }

  // Fetch current request
  const existing = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  const leaveRequest = existing.rows[0] as unknown as {
    id: string;
    employee_id: string;
    days: number;
    status: string;
    start_date: string;
    end_date: string;
  };

  if (leaveRequest.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot review a request that is already '${leaveRequest.status}'` },
      { status: 400 }
    );
  }

  if (role === "supervisor") {
    const canAccess = await supervisorCanAccessEmployee(
      session.user.id!,
      leaveRequest.employee_id
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: "Huwezi kupitia ombi la mfanyakazi huyu" },
        { status: 403 }
      );
    }
  }

  await db.execute({
    sql: `UPDATE leave_requests
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
          WHERE id = ?`,
    args: [status, session.user.id!, review_note ?? null, id],
  });

  // If approved, increment used_days in leave_balances
  if (status === "approved") {
    const year = new Date(leaveRequest.start_date).getFullYear();

    // Check if balance row exists
    const balanceResult = await db.execute({
      sql: "SELECT id FROM leave_balances WHERE employee_id = ? AND year = ?",
      args: [leaveRequest.employee_id, year],
    });

    if (balanceResult.rows.length > 0) {
      await db.execute({
        sql: "UPDATE leave_balances SET used_days = used_days + ? WHERE employee_id = ? AND year = ?",
        args: [leaveRequest.days, leaveRequest.employee_id, year],
      });
    } else {
      // Create balance row with used days
      await db.execute({
        sql: `INSERT INTO leave_balances (id, employee_id, year, allowed_days, used_days)
              VALUES (?, ?, ?, 28, ?)`,
        args: [nanoid(), leaveRequest.employee_id, year, leaveRequest.days],
      });
    }
  }

  const result = await db.execute({
    sql: `SELECT lr.*, e.name as employee_name, e.phone as employee_phone
          FROM leave_requests lr
          JOIN employees e ON lr.employee_id = e.id
          WHERE lr.id = ?`,
    args: [id],
  });

  // Notify the employee of the decision via SMS
  const row = result.rows[0] as unknown as {
    employee_name: string;
    employee_phone: string | null;
    start_date: string;
    end_date: string;
    days: number;
  } | undefined;
  if (row?.employee_phone) {
    const dates = `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`;
    const msg =
      status === "approved"
        ? `TrustTrack: Likizo yako (${row.days} siku, ${dates}) IMEIDHINISHWA.${review_note ? ` ${review_note}` : ""}`
        : `TrustTrack: Likizo yako (${dates}) IMEKATALIWA.${review_note ? ` Sababu: ${review_note}` : ""}`;
    await sendSMS(row.employee_phone, msg, {
      sentBy: session.user.id ?? null,
      source: "leave_decision",
    });
  }

  return NextResponse.json(result.rows[0]);
}
