import { NextRequest, NextResponse } from "next/server";
import type { InStatement } from "@libsql/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiHandler } from "@/lib/api-handler";
import { overtimeDaysFromHours } from "@/lib/overtime";

const FADHILA_AMOUNT = 10000;
const NSSF_RATE = 0.10;

async function _POST(request: NextRequest) {
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

  // ── Aggregate all per-employee lookups up front (3 queries, not 3 per employee) ──
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
      // hours as well as amount: overtime is paid on top of base pay AND
      // counts as day equivalents (9h = 1 day) in days_worked on the payslip.
      sql: `SELECT employee_id,
              COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(hours),  0) AS total_hours
            FROM overtime_entries
            WHERE date >= ? AND date <= ?
            GROUP BY employee_id`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT employee_id, COALESCE(SUM(amount), 0) AS total
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

  const overtimeMap = new Map<string, { total: number; total_hours: number }>();
  for (const r of overtimeAgg.rows as unknown as {
    employee_id: string; total: number; total_hours: number;
  }[]) {
    overtimeMap.set(r.employee_id, {
      total: Number(r.total ?? 0),
      total_hours: Number(r.total_hours ?? 0),
    });
  }

  const advanceMap = new Map<string, number>();
  for (const r of advanceAgg.rows as unknown as { employee_id: string; total: number }[]) {
    advanceMap.set(r.employee_id, Number(r.total ?? 0));
  }

  // ── Compute every payslip in memory, then write them in one batch ──
  const payslipStatements: InStatement[] = [];
  const smsTargets: { phone: string; message: string; employeeId: string }[] = [];
  const deadline = new Date(year, month, 5).toISOString().split("T")[0];

  for (const emp of employees.rows as unknown as {
    id: string; name: string; phone: string; type: string;
    daily_rate: number; monthly_salary: number;
    deduct_nssf: number; deduct_cotwu: number; deduct_fadhila: number;
    heslb_amount: number; wcf_amount: number;
    food_advance_amount: number;
    company_cotwu_rate: number;
  }[]) {
    const att = attendMap.get(emp.id) ?? { present_days: 0, half_days: 0 };
    const effectiveDays = att.present_days + att.half_days * 0.5;

    const baseGross = emp.type === "casual"
      ? Math.round(effectiveDays * emp.daily_rate)
      : emp.monthly_salary;

    // Overtime — the amount is paid on top of base, and the hours also count
    // as day equivalents (9h = 1 day) in the days recorded on the payslip.
    const ot = overtimeMap.get(emp.id) ?? { total: 0, total_hours: 0 };
    const totalOvertime = Math.round(ot.total);
    const overtimeDays = overtimeDaysFromHours(ot.total_hours);
    const grossAmount = baseGross + totalOvertime;

    const totalAdvances = Math.abs(advanceMap.get(emp.id) ?? 0);
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

    payslipStatements.push({
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

    if (send_sms && emp.phone) {
      const message = emp.type === "casual"
        ? smsTemplates.payrollReady(
            monthName, Math.round(effectiveDays),
            formatCurrency(emp.daily_rate), formatCurrency(grossAmount), formatDate(deadline)
          )
        : smsTemplates.periodLocked(monthName);
      smsTargets.push({ phone: emp.phone, message, employeeId: emp.id });
    }
  }

  // Write all payslips in chunked batches (libSQL caps batch size)
  const CHUNK = 50;
  for (let i = 0; i < payslipStatements.length; i += CHUNK) {
    await db.batch(payslipStatements.slice(i, i + CHUNK), "write");
  }

  // SMS must go one at a time (external gateway); collect successes then flag in one batch
  const smsSuccessIds: string[] = [];
  for (const target of smsTargets) {
    const result = await sendSMS(target.phone, target.message, {
      sentBy: session.user.id ?? null,
      source: "payroll_lock",
    });
    if (result.success) {
      smsSent++;
      smsSuccessIds.push(target.employeeId);
    }
  }

  if (smsSuccessIds.length > 0) {
    const flagStatements: InStatement[] = smsSuccessIds.map((employeeId) => ({
      sql: "UPDATE payslips SET sent_sms = 1 WHERE employee_id = ? AND period_id = ?",
      args: [employeeId, periodId],
    }));
    for (let i = 0; i < flagStatements.length; i += CHUNK) {
      await db.batch(flagStatements.slice(i, i + CHUNK), "write");
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

async function _PUT(request: NextRequest) {
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

export const POST = apiHandler(_POST);
export const PUT = apiHandler(_PUT);
