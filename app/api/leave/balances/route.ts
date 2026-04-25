import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const year = new Date().getFullYear();

  const result = await db.execute({
    sql: `SELECT
            e.id, e.name, e.department, e.type,
            COALESCE(e.leave_allowance_days, 28) AS allowed_days,
            COALESCE(lb.used_days, 0)             AS used_days,
            COALESCE(lb.carryover_days, 0)        AS carryover_days
          FROM employees e
          LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = ?
          WHERE e.active = 1
          ORDER BY e.name`,
    args: [year],
  });

  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { employee_id, days, reason } = body as {
    employee_id?: string;
    days?: number;
    reason?: string;
  };

  if (!employee_id || !days || days <= 0) {
    return NextResponse.json({ error: "employee_id na days zinahitajika" }, { status: 400 });
  }

  const year = new Date().getFullYear();

  const empResult = await db.execute({
    sql: "SELECT id, leave_allowance_days FROM employees WHERE id = ? AND active = 1",
    args: [employee_id],
  });
  if (!empResult.rows.length) {
    return NextResponse.json({ error: "Mfanyakazi hajapatikana" }, { status: 404 });
  }
  const emp = empResult.rows[0] as unknown as { id: string; leave_allowance_days: number | null };
  const allowedDays = emp.leave_allowance_days ?? 28;

  const existingBal = await db.execute({
    sql: "SELECT id FROM leave_balances WHERE employee_id = ? AND year = ?",
    args: [employee_id, year],
  });

  if (existingBal.rows.length > 0) {
    const bal = existingBal.rows[0] as unknown as { id: string };
    await db.execute({
      sql: "UPDATE leave_balances SET used_days = used_days + ? WHERE id = ?",
      args: [days, bal.id],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO leave_balances (id, employee_id, year, allowed_days, used_days, carryover_days)
            VALUES (?, ?, ?, ?, ?, 0)`,
      args: [nanoid(), employee_id, year, allowedDays, days],
    });
  }

  // Audit trail: a pre-approved leave_request with type manual_deduction
  await db.execute({
    sql: `INSERT INTO leave_requests (id, employee_id, start_date, end_date, days, reason, leave_type, status, reviewed_by, reviewed_at)
          VALUES (?, ?, date('now'), date('now'), ?, ?, 'manual_deduction', 'approved', ?, CURRENT_TIMESTAMP)`,
    args: [nanoid(), employee_id, days, reason ?? "Marekebisho ya mkono na HR", session.user.id!],
  });

  return NextResponse.json({ ok: true });
}
