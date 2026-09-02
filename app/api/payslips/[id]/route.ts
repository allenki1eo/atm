import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const { id } = await params;
  const role = (session.user as { role: string }).role;

  const psRes = await db.execute({
    sql: "SELECT * FROM payslips WHERE id = ?",
    args: [id],
  });
  if (psRes.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const payslip = psRes.rows[0] as unknown as {
    id: string;
    employee_id: string;
    period_id: string;
    days_worked: number;
    gross_amount: number;
    total_advances: number;
    net_amount: number;
    nssf_amount: number;
    cotwu_amount: number;
    fadhila_amount: number;
    heslb_amount: number;
    total_deductions: number;
    generated_at: string;
  };

  if (role !== "hr" && role !== "admin") {
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [session.user.id!],
    });
    const linkedEmployeeId =
      (userRes.rows[0] as unknown as { employee_id: string | null } | undefined)
        ?.employee_id ?? null;
    if (payslip.employee_id !== linkedEmployeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const empRes = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [payslip.employee_id],
  });
  const employee = empRes.rows[0] ?? null;

  let section = null;
  const emp = employee as unknown as { section_id: string | null } | null;
  if (emp?.section_id) {
    const secRes = await db.execute({
      sql: "SELECT * FROM sections WHERE id = ?",
      args: [emp.section_id],
    });
    section = secRes.rows[0] ?? null;
  }

  const periodRes = await db.execute({
    sql: "SELECT * FROM payroll_periods WHERE id = ?",
    args: [payslip.period_id],
  });
  const period = periodRes.rows[0] ?? null;

  return NextResponse.json({ payslip, employee, section, period });
}

export const GET = apiHandler(_GET);
