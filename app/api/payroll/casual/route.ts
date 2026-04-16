import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  // Find the period
  const periodResult = await db.execute({
    sql: "SELECT id FROM payroll_periods WHERE month = ? AND year = ?",
    args: [month, year],
  });

  if (!periodResult.rows.length) {
    return NextResponse.json({ payslips: [], period: null });
  }

  const periodId = (periodResult.rows[0] as unknown as { id: string }).id;

  const result = await db.execute({
    sql: `SELECT
            ps.*,
            e.name as employee_name,
            e.type,
            e.daily_rate,
            e.monthly_salary
          FROM payslips ps
          JOIN employees e ON e.id = ps.employee_id
          WHERE ps.period_id = ?
          ORDER BY e.name`,
    args: [periodId],
  });

  return NextResponse.json({ payslips: result.rows, period_id: periodId });
}
