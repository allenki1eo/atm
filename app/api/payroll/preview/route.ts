import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const FADHILA_AMOUNT = 10000;
const NSSF_RATE = 0.10;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") ?? "");
  const year = parseInt(searchParams.get("year") ?? "");
  const companyId = searchParams.get("company_id") ?? null;

  if (!month || !year) return NextResponse.json({ error: "month and year required" }, { status: 400 });

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const employees = await db.execute({
    sql: companyId
      ? `SELECT e.*, COALESCE(c.cotwu_rate, 0) AS company_cotwu_rate
         FROM employees e LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.active = 1 AND e.company_id = ? ORDER BY e.name`
      : `SELECT e.*, COALESCE(c.cotwu_rate, 0) AS company_cotwu_rate
         FROM employees e LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.active = 1 ORDER BY e.name`,
    args: companyId ? [companyId] : [],
  });

  const rows = [];
  for (const emp of employees.rows as unknown as {
    id: string; name: string; phone: string; type: string;
    daily_rate: number; monthly_salary: number;
    deduct_nssf: number; deduct_cotwu: number; deduct_fadhila: number;
    heslb_amount: number; wcf_amount: number;
    food_advance_amount: number;
    company_cotwu_rate: number;
  }[]) {
    const attendResult = await db.execute({
      sql: `SELECT status FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`,
      args: [emp.id, startDate, endDate],
    });
    const records = attendResult.rows as unknown as { status: string }[];
    const presentDays = records.filter((r) => ["present", "late"].includes(r.status)).length;
    const halfDays = records.filter((r) => r.status === "half_day").length;
    const effectiveDays = presentDays + halfDays * 0.5;

    const baseGross = emp.type === "casual"
      ? Math.round(effectiveDays * emp.daily_rate)
      : emp.monthly_salary;

    const overtimeRes = await db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) as total FROM overtime_entries WHERE employee_id = ? AND date >= ? AND date <= ?`,
      args: [emp.id, startDate, endDate],
    });
    const totalOvertime = Math.round((overtimeRes.rows[0] as unknown as { total: number }).total);

    const advRes = await db.execute({
      sql: `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
            WHERE employee_id = ? AND type = 'advance_given' AND created_at >= ? AND created_at <= ?`,
      args: [emp.id, startDate + " 00:00:00", endDate + " 23:59:59"],
    });
    const totalAdvances = Math.round((advRes.rows[0] as unknown as { total: number }).total);
    const foodAdvanceAmount = emp.food_advance_amount ?? 0;
    const totalAdvanceDeductions = totalAdvances + foodAdvanceAmount;

    const grossAmount = baseGross + totalOvertime;

    const nssfAmount    = emp.deduct_nssf    ? Math.round(grossAmount * NSSF_RATE) : 0;
    const cotwuAmount   = emp.deduct_cotwu   ? (emp.company_cotwu_rate ?? 0)       : 0;
    const fadhilaAmount = emp.deduct_fadhila ? FADHILA_AMOUNT                       : 0;
    const heslbAmount   = emp.heslb_amount   ?? 0;
    const wcfAmount     = emp.wcf_amount     ?? 0;

    const totalDeductions = nssfAmount + cotwuAmount + fadhilaAmount + heslbAmount + wcfAmount + totalAdvanceDeductions;
    const netAmount = grossAmount - totalDeductions;

    rows.push({
      employee_id: emp.id,
      employee_name: emp.name,
      employee_type: emp.type,
      days_worked: Math.round(effectiveDays),
      base_gross: baseGross,
      total_overtime: totalOvertime,
      gross_amount: grossAmount,
      nssf_amount: nssfAmount,
      cotwu_amount: cotwuAmount,
      fadhila_amount: fadhilaAmount,
      heslb_amount: heslbAmount,
      wcf_amount: wcfAmount,
      total_deductions: totalDeductions,
      salary_advances: totalAdvances,
      food_advance_amount: foodAdvanceAmount,
      total_advances: totalAdvanceDeductions,
      net_amount: netAmount,
    });
  }

  return NextResponse.json({ month, year, employees: rows });
}
