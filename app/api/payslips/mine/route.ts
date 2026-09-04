import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userRes = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [session.user.id!],
  });
  const employeeId =
    (userRes.rows[0] as unknown as { employee_id: string | null } | undefined)
      ?.employee_id ?? null;
  if (!employeeId) return NextResponse.json([]);

  const res = await db.execute({
    sql: `
      SELECT
        p.id, p.employee_id, p.period_id, p.days_worked, p.overtime_days,
        p.gross_amount, p.total_advances, p.net_amount,
        p.nssf_amount, p.cotwu_amount, p.fadhila_amount, p.heslb_amount,
        p.total_deductions, p.generated_at,
        pp.month, pp.year, pp.start_date, pp.end_date
      FROM payslips p
      JOIN payroll_periods pp ON pp.id = p.period_id
      WHERE p.employee_id = ?
      ORDER BY pp.year DESC, pp.month DESC, p.generated_at DESC
    `,
    args: [employeeId],
  });

  return NextResponse.json(res.rows);
}

export const GET = apiHandler(_GET);
