import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

const FADHILA_AMOUNT = 10000;
const NSSF_RATE = 0.10;

async function _GET(request: NextRequest) {
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

  // ── Aggregate all three lookups up front (3 queries total, not 3 per employee) ──
  const [attendAgg, overtimeAgg, advanceAgg] = await Promise.all([
    db.execute({
      sql: `SELECT employee_id,
              SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS present_days,
              SUM(CASE WHEN status = 'half_day'          THEN 1 ELSE 0 END) AS half_days
            FROM attendance
            WHERE date >= ? AND date <= ?
            GROUP BY employee_id`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT employee_id, COALESCE(SUM(amount), 0) AS total
            FROM overtime_entries
            WHERE date >= ? AND date <= ?
            GROUP BY employee_id`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT employee_id, COALESCE(SUM(ABS(amount)), 0) AS total
            FROM transactions
            WHERE type = 'advance_given' AND created_at >= ? AND created_at <= ?
            GROUP BY employee_id`,
      args: [startDate + " 00:00:00", endDate + " 23:59:59"],
    }),
  ]);

  const attendMap = new Map<string, { present_days: number; half_days: number }>();
  for (const r of attendAgg.rows as unknown as {
    employee_id: string; present_days: number; half_days: number;
  }[]) {
    attendMap.set(r.employee_id, {
      present_days: Number(r.present_days ?? 0),
      half_days: Number(r.half_days ?? 0),
    });
  }

  const overtimeMap = new Map<string, number>();
  for (const r of overtimeAgg.rows as unknown as { employee_id: string; total: number }[]) {
    overtimeMap.set(r.employee_id, Number(r.total ?? 0));
  }

  const advanceMap = new Map<string, number>();
  for (const r of advanceAgg.rows as unknown as { employee_id: string; total: number }[]) {
    advanceMap.set(r.employee_id, Number(r.total ?? 0));
  }

  const rows = [];
  for (const emp of employees.rows as unknown as {
    id: string; name: string; phone: string; type: string;
    daily_rate: number; monthly_salary: number;
    deduct_nssf: number; deduct_cotwu: number; deduct_fadhila: number;
    heslb_amount: number; wcf_amount: number;
    food_advance_amount: number;
    company_cotwu_rate: number;
  }[]) {
    const att = attendMap.get(emp.id) ?? { present_days: 0, half_days: 0 };
    const presentDays = att.present_days;
    const halfDays = att.half_days;
    const effectiveDays = presentDays + halfDays * 0.5;

    const baseGross = emp.type === "casual"
      ? Math.round(effectiveDays * emp.daily_rate)
      : emp.monthly_salary;

    const totalOvertime = Math.round(overtimeMap.get(emp.id) ?? 0);

    const totalAdvances = Math.round(advanceMap.get(emp.id) ?? 0);
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

export const GET = apiHandler(_GET);
