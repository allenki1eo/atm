import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency, formatDate } from "@/lib/utils";
import { overtimeDaysFromHours } from "@/lib/overtime";

const FADHILA_AMOUNT = 10000;
const NSSF_RATE = 0.10;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { month, year, send_sms = true, company_id } = body as {
    month: number;
    year: number;
    send_sms?: boolean;
    company_id?: string | null;
  };

  if (!month || !year) {
    return NextResponse.json({ error: "Month and year required" }, { status: 400 });
  }

  const scopedCompanyId = company_id ?? null;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Create or update payroll period
  const existing = await db.execute({
    sql: scopedCompanyId
      ? "SELECT id FROM payroll_periods WHERE month = ? AND year = ? AND company_id = ?"
      : "SELECT id FROM payroll_periods WHERE month = ? AND year = ? AND company_id IS NULL",
    args: scopedCompanyId ? [month, year, scopedCompanyId] : [month, year],
  });

  let periodId: string;
  if (existing.rows.length > 0) {
    periodId = (existing.rows[0] as unknown as { id: string }).id;
    await db.execute({
      sql: `UPDATE payroll_periods SET status = 'locked', locked_at = CURRENT_TIMESTAMP, locked_by = ? WHERE id = ?`,
      args: [session.user.id!, periodId],
    });
  } else {
    periodId = nanoid();
    await db.execute({
      sql: `INSERT INTO payroll_periods (id, month, year, start_date, end_date, status, locked_at, locked_by, company_id)
            VALUES (?, ?, ?, ?, ?, 'locked', CURRENT_TIMESTAMP, ?, ?)`,
      args: [periodId, month, year, startDate, endDate, session.user.id!, scopedCompanyId],
    });
  }

  // Lock attendance
  if (scopedCompanyId) {
    await db.execute({
      sql: `UPDATE attendance SET is_locked = 1
            WHERE date >= ? AND date <= ?
              AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)`,
      args: [startDate, endDate, scopedCompanyId],
    });
  } else {
    await db.execute({
      sql: "UPDATE attendance SET is_locked = 1 WHERE date >= ? AND date <= ?",
      args: [startDate, endDate],
    });
  }

  // Fetch employees with deduction fields and their company's cotwu_rate
  const employees = await db.execute({
    sql: scopedCompanyId
      ? `SELECT e.*, COALESCE(c.cotwu_rate, 0) AS company_cotwu_rate
         FROM employees e LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.active = 1 AND e.company_id = ?`
      : `SELECT e.*, COALESCE(c.cotwu_rate, 0) AS company_cotwu_rate
         FROM employees e LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.active = 1`,
    args: scopedCompanyId ? [scopedCompanyId] : [],
  });

  let smsSent = 0;

  for (const emp of employees.rows as unknown as {
    id: string; name: string; phone: string; type: string;
    daily_rate: number; monthly_salary: number;
    deduct_nssf: number; deduct_cotwu: number; deduct_fadhila: number;
    heslb_amount: number; wcf_amount: number;
    food_advance_amount: number;
    company_cotwu_rate: number;
  }[]) {
    // Attendance
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

    // Overtime — the amount is paid on top of base, and the hours also count
    // as day equivalents (9h = 1 day) in the days recorded on the payslip.
    const overtimeResult = await db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(hours), 0) as total_hours
            FROM overtime_entries WHERE employee_id = ? AND date >= ? AND date <= ?`,
      args: [emp.id, startDate, endDate],
    });
    const overtimeRow = overtimeResult.rows[0] as unknown as { total: number; total_hours: number };
    const totalOvertime = Math.round(overtimeRow.total);
    const overtimeDays = overtimeDaysFromHours(overtimeRow.total_hours);
    const grossAmount = baseGross + totalOvertime;

    // Advances
    const advResult = await db.execute({
      sql: `SELECT SUM(amount) as total FROM transactions
            WHERE employee_id = ? AND type = 'advance_given'
            AND created_at >= ? AND created_at <= ?`,
      args: [emp.id, startDate + " 00:00:00", endDate + " 23:59:59"],
    });
    const totalAdvances = Math.abs((advResult.rows[0] as unknown as { total: number }).total ?? 0);
    const foodAdvanceAmount = emp.food_advance_amount ?? 0;
    const totalAdvanceDeductions = totalAdvances + foodAdvanceAmount;

    // Statutory & other deductions
    const nssfAmount    = emp.deduct_nssf    ? Math.round(grossAmount * NSSF_RATE) : 0;
    const cotwuAmount   = emp.deduct_cotwu   ? (emp.company_cotwu_rate ?? 0)       : 0;
    const fadhilaAmount = emp.deduct_fadhila ? FADHILA_AMOUNT                       : 0;
    const heslbAmount   = emp.heslb_amount   ?? 0;
    const wcfAmount     = emp.wcf_amount     ?? 0;

    const totalDeductions = nssfAmount + cotwuAmount + fadhilaAmount + heslbAmount + wcfAmount + totalAdvanceDeductions;
    const netAmount = grossAmount - totalDeductions;

    // Upsert payslip with all deduction columns
    await db.execute({
      sql: `INSERT INTO payslips
              (id, employee_id, period_id, days_worked, overtime_days, gross_amount, total_advances,
               net_amount, nssf_amount, cotwu_amount, fadhila_amount,
               heslb_amount, wcf_amount, total_deductions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, period_id) DO UPDATE SET
              days_worked      = excluded.days_worked,
              overtime_days    = excluded.overtime_days,
              gross_amount     = excluded.gross_amount,
              total_advances   = excluded.total_advances,
              net_amount       = excluded.net_amount,
              nssf_amount      = excluded.nssf_amount,
              cotwu_amount     = excluded.cotwu_amount,
              fadhila_amount   = excluded.fadhila_amount,
              heslb_amount     = excluded.heslb_amount,
              wcf_amount       = excluded.wcf_amount,
              total_deductions = excluded.total_deductions,
              generated_at     = CURRENT_TIMESTAMP`,
      args: [
        // days_worked stays attendance-only so it still reconciles with
        // base pay (days × daily rate); overtime days are stored alongside.
        nanoid(), emp.id, periodId, effectiveDays, overtimeDays, grossAmount,
        totalAdvanceDeductions, netAmount, nssfAmount, cotwuAmount, fadhilaAmount,
        heslbAmount, wcfAmount, totalDeductions,
      ],
    });

    // Send SMS
    if (send_sms && emp.phone) {
      const deadline = new Date(year, month, 5).toISOString().split("T")[0];
      let message: string;

      if (emp.type === "casual") {
        message = smsTemplates.payrollReady(
          monthName, Math.round(effectiveDays),
          formatCurrency(emp.daily_rate), formatCurrency(grossAmount), formatDate(deadline)
        );
      } else {
        message = smsTemplates.periodLocked(monthName);
      }

      const result = await sendSMS(emp.phone, message, {
        sentBy: session.user.id ?? null,
        source: "payroll_lock",
      });
      if (result.success) smsSent++;

      await db.execute({
        sql: "UPDATE payslips SET sent_sms = 1 WHERE employee_id = ? AND period_id = ?",
        args: [emp.id, periodId],
      });
    }
  }

  return NextResponse.json({
    success: true,
    period_id: periodId,
    month,
    year,
    sms_sent: smsSent,
    employees_processed: employees.rows.length,
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { period_id } = body as { period_id?: string };
  if (!period_id) return NextResponse.json({ error: "period_id required" }, { status: 400 });

  const periodRes = await db.execute({
    sql: "SELECT * FROM payroll_periods WHERE id = ?",
    args: [period_id],
  });
  if (!periodRes.rows.length) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  const p = periodRes.rows[0] as unknown as {
    id: string; start_date: string; end_date: string; company_id: string | null;
  };

  if (p.company_id) {
    await db.execute({
      sql: `UPDATE attendance SET is_locked = 0 WHERE date >= ? AND date <= ?
            AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)`,
      args: [p.start_date, p.end_date, p.company_id],
    });
  } else {
    await db.execute({
      sql: "UPDATE attendance SET is_locked = 0 WHERE date >= ? AND date <= ?",
      args: [p.start_date, p.end_date],
    });
  }

  await db.execute({
    sql: "UPDATE payroll_periods SET status = 'open', locked_at = NULL, locked_by = NULL WHERE id = ?",
    args: [p.id],
  });

  return NextResponse.json({ success: true });
}
