import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";
import { addDays, overtimeDaysFromHours } from "@/lib/overtime";

async function _GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let employeeId: string | null = searchParams.get("employee_id");
  if (!employeeId) {
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [session.user.id!],
    });
    employeeId =
      (userRes.rows[0] as unknown as { employee_id: string | null } | undefined)
        ?.employee_id ?? null;
  }
  if (!employeeId) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  const now = new Date();
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  // Get employee info
  const empResult = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [employeeId!],
  });

  if (!empResult.rows.length) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const emp = empResult.rows[0] as unknown as {
    id: string;
    name: string;
    type: string;
    daily_rate: number;
    monthly_salary: number;
    food_advance_amount: number;
    overtime_rule: string;
  };

  // Get attendance for the period
  const attendResult = await db.execute({
    sql: `SELECT status, date FROM attendance
          WHERE employee_id = ? AND date >= ? AND date <= ?`,
    args: [employeeId!, startDate, endDate],
  });

  const records = attendResult.rows as unknown as { status: string; date: string }[];
  const lateDays = records.filter((r) => r.status === "late").length;
  const presentDays = records.filter((r) =>
    ["present", "late"].includes(r.status)
  ).length;
  const halfDays = records.filter((r) => r.status === "half_day").length;
  const effectiveDays = presentDays + halfDays * 0.5;

  // Calculate base gross
  let baseGross = 0;
  if (emp.type === "casual") {
    baseGross = Math.round(effectiveDays * emp.daily_rate);
  } else {
    baseGross = emp.monthly_salary;
  }

  // Add overtime
  const overtimeRes = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(hours), 0) as total_hours
          FROM overtime_entries WHERE employee_id = ? AND date >= ? AND date <= ?`,
    args: [employeeId!, startDate, endDate],
  });
  const overtimeRow = overtimeRes.rows[0] as unknown as { total: number; total_hours: number };
  const totalOvertime = Math.round(overtimeRow.total);
  const overtimeDays = overtimeDaysFromHours(overtimeRow.total_hours);
  // For full-time employees, overtime is paid separately — not rolled into payslip gross
  const grossAmount = emp.type === "casual" ? baseGross + totalOvertime : baseGross;

  // Get advances
  const advanceResult = await db.execute({
    sql: `SELECT SUM(amount) as total FROM transactions
          WHERE employee_id = ? AND type = 'advance_given'
          AND created_at >= ? AND created_at <= ?`,
    args: [employeeId!, startDate + " 00:00:00", endDate + " 23:59:59"],
  });
  const totalAdvances = Math.abs((advanceResult.rows[0] as unknown as { total: number }).total ?? 0);
  const foodAdvanceAmount = emp.food_advance_amount ?? 0;
  const totalAdvanceDeductions = totalAdvances + foodAdvanceAmount;

  // Net amount
  const netAmount = grossAmount - totalAdvanceDeductions;

  // Get period info
  const periodResult = await db.execute({
    sql: "SELECT * FROM payroll_periods WHERE month = ? AND year = ?",
    args: [month, year],
  });
  const period = periodResult.rows[0] ?? null;

  return NextResponse.json({
    employee: emp,
    period: { month, year, start_date: startDate, end_date: endDate, info: period },
    attendance: {
      present: presentDays,
      late: lateDays,
      half_day: halfDays,
      absent: records.filter((r) => r.status === "absent").length,
      // effective_days drives base pay (days × daily rate); days_worked is the
      // headline count and includes overtime day equivalents (9h = 1 day).
      effective_days: effectiveDays,
      overtime_hours: Number(overtimeRow.total_hours ?? 0),
      overtime_days: overtimeDays,
      days_worked: addDays(effectiveDays, overtimeDays),
      total_records: records.length,
    },
    financial: {
      daily_rate: emp.daily_rate,
      monthly_salary: emp.monthly_salary,
      base_gross: baseGross,
      total_overtime: totalOvertime,
      gross_amount: grossAmount,
      salary_advances: totalAdvances,
      food_advance_amount: foodAdvanceAmount,
      total_advances: totalAdvanceDeductions,
      net_amount: netAmount,
    },
  });
}

export const GET = apiHandler(_GET);
