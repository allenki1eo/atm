import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency, formatDate } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { month, year, send_sms = true } = body;

  if (!month || !year) {
    return NextResponse.json({ error: "Month and year required" }, { status: 400 });
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Create or update payroll period
  const existing = await db.execute({
    sql: "SELECT id FROM payroll_periods WHERE month = ? AND year = ?",
    args: [month, year],
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
      sql: `INSERT INTO payroll_periods (id, month, year, start_date, end_date, status, locked_at, locked_by)
            VALUES (?, ?, ?, ?, ?, 'locked', CURRENT_TIMESTAMP, ?)`,
      args: [periodId, month, year, startDate, endDate, session.user.id!],
    });
  }

  // Lock all attendance for the period
  await db.execute({
    sql: "UPDATE attendance SET is_locked = 1 WHERE date >= ? AND date <= ?",
    args: [startDate, endDate],
  });

  // Generate payslips and send SMS
  const employees = await db.execute({
    sql: "SELECT * FROM employees WHERE active = 1",
    args: [],
  });

  let smsSent = 0;

  for (const emp of employees.rows as unknown as {
    id: string;
    name: string;
    phone: string;
    type: string;
    daily_rate: number;
    monthly_salary: number;
  }[]) {
    const attendResult = await db.execute({
      sql: `SELECT status FROM attendance
            WHERE employee_id = ? AND date >= ? AND date <= ?`,
      args: [emp.id, startDate, endDate],
    });

    const records = attendResult.rows as unknown as { status: string }[];
    const presentDays = records.filter((r) => ["present", "late"].includes(r.status)).length;
    const halfDays = records.filter((r) => r.status === "half_day").length;
    const effectiveDays = presentDays + halfDays * 0.5;

    const grossAmount =
      emp.type === "casual"
        ? Math.round(effectiveDays * emp.daily_rate)
        : emp.monthly_salary;

    const advResult = await db.execute({
      sql: `SELECT SUM(amount) as total FROM transactions
            WHERE employee_id = ? AND type = 'advance_given'
            AND created_at >= ? AND created_at <= ?`,
      args: [emp.id, startDate + " 00:00:00", endDate + " 23:59:59"],
    });
    const totalAdvances = Math.abs((advResult.rows[0] as unknown as { total: number }).total ?? 0);
    const netAmount = grossAmount - totalAdvances;

    // Upsert payslip
    await db.execute({
      sql: `INSERT INTO payslips (id, employee_id, period_id, days_worked, gross_amount, total_advances, net_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, period_id) DO UPDATE SET
            days_worked = excluded.days_worked,
            gross_amount = excluded.gross_amount,
            total_advances = excluded.total_advances,
            net_amount = excluded.net_amount,
            generated_at = CURRENT_TIMESTAMP`,
      args: [nanoid(), emp.id, periodId, Math.round(effectiveDays), grossAmount, totalAdvances, netAmount],
    });

    // Send SMS
    if (send_sms && emp.phone) {
      const deadline = new Date(year, month, 5).toISOString().split("T")[0];
      let message: string;

      if (emp.type === "casual") {
        message = smsTemplates.payrollReady(
          monthName,
          Math.round(effectiveDays),
          formatCurrency(emp.daily_rate),
          formatCurrency(grossAmount),
          formatDate(deadline)
        );
      } else {
        message = smsTemplates.periodLocked(monthName);
      }

      const result = await sendSMS(emp.phone, message);
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
