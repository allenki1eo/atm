import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

const isValidDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isValidMonthYear = (month: number, year: number) =>
  Number.isInteger(month) &&
  month >= 1 &&
  month <= 12 &&
  Number.isInteger(year) &&
  year >= 2000 &&
  year <= 2100;

async function isPayrollLocked(date: string, companyId: string | null) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const locked = await db.execute({
    sql: `SELECT id FROM payroll_periods
          WHERE month = ? AND year = ?
            AND status IN ('locked', 'paid')
            AND (company_id IS NULL OR company_id = ?)
          LIMIT 1`,
    args: [m, y, companyId],
  });
  return locked.rows.length > 0;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  let sql = `SELECT
               oe.*,
               e.name as employee_name,
               e.type as employee_type,
               e.overtime_rule,
               a.status as attendance_status
             FROM overtime_entries oe
             JOIN employees e ON e.id = oe.employee_id
             LEFT JOIN attendance a ON a.employee_id = oe.employee_id AND a.date = oe.date
             WHERE e.active = 1`;
  const args: (string | number)[] = [];

  if (employeeId) { sql += " AND oe.employee_id = ?"; args.push(employeeId); }
  if (month && year) {
    const y = parseInt(year), m = parseInt(month);
    if (!isValidMonthYear(m, y)) {
      return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
    }
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = new Date(y, m, 0).toISOString().split("T")[0];
    sql += " AND oe.date >= ? AND oe.date <= ?";
    args.push(start, end);
  }
  sql += " ORDER BY oe.date DESC";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { employee_id, date, hours, notes } = body as {
    employee_id?: string;
    date?: string;
    hours?: number | string;
    notes?: string;
  };

  const overtimeHours = Number(hours);
  if (!employee_id || !date || !Number.isFinite(overtimeHours)) {
    return NextResponse.json({ error: "employee_id, date, and hours required" }, { status: 400 });
  }
  if (!isValidDateOnly(date)) {
    return NextResponse.json({ error: "Tarehe si sahihi" }, { status: 400 });
  }
  if (overtimeHours <= 0 || overtimeHours > 24 || overtimeHours * 2 !== Math.round(overtimeHours * 2)) {
    return NextResponse.json({ error: "Saa za overtime ziwe kati ya 0.5 na 24 kwa hatua za nusu saa" }, { status: 400 });
  }

  const empResult = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [employee_id],
  });
  if (!empResult.rows.length) {
    return NextResponse.json({ error: "Mfanyakazi hajapatikana" }, { status: 404 });
  }

  const emp = empResult.rows[0] as unknown as {
    type: string;
    daily_rate: number;
    monthly_salary: number;
    overtime_rule: string;
    company_id: string | null;
    active: number;
  };

  if (!emp.active) {
    return NextResponse.json({ error: "Mfanyakazi huyu hayupo active" }, { status: 400 });
  }

  if (emp.overtime_rule === "none") {
    return NextResponse.json({ error: "Mfanyakazi huyu hana ruhusa ya overtime" }, { status: 400 });
  }
  if (emp.type === "casual" && (emp.daily_rate ?? 0) <= 0) {
    return NextResponse.json({ error: "Mfanyakazi wa mkataba hana daily rate" }, { status: 400 });
  }
  if (emp.type === "fulltime" && (emp.monthly_salary ?? 0) <= 0) {
    return NextResponse.json({ error: "Mfanyakazi wa kudumu hana monthly salary" }, { status: 400 });
  }
  if (await isPayrollLocked(date, emp.company_id ?? null)) {
    return NextResponse.json({ error: "Payroll ya mwezi huu imefungwa; fungua kipindi kabla ya kubadilisha overtime" }, { status: 400 });
  }

  const attendanceResult = await db.execute({
    sql: "SELECT status FROM attendance WHERE employee_id = ? AND date = ?",
    args: [employee_id, date],
  });
  const attendance = attendanceResult.rows[0] as unknown as { status: string } | undefined;
  if (attendance?.status === "absent") {
    return NextResponse.json({ error: "Mfanyakazi amewekwa absent siku hii; rekebisha attendance kwanza" }, { status: 400 });
  }

  if (emp.overtime_rule === "holidays_only") {
    const holidayResult = await db.execute({
      sql: `SELECT id FROM holidays
            WHERE date = ? AND (company_id IS NULL OR company_id = ?)
            LIMIT 1`,
      args: [date, emp.company_id ?? null],
    });
    if (!holidayResult.rows.length) {
      return NextResponse.json({ error: "Sheria ya mfanyakazi huyu inaruhusu overtime kwenye sikukuu tu" }, { status: 400 });
    }
  }

  const existingHoursResult = await db.execute({
    sql: "SELECT COALESCE(SUM(hours), 0) as total FROM overtime_entries WHERE employee_id = ? AND date = ?",
    args: [employee_id, date],
  });
  const existingHours = Number((existingHoursResult.rows[0] as unknown as { total: number }).total ?? 0);
  if (existingHours + overtimeHours > 24) {
    return NextResponse.json({ error: "Jumla ya overtime siku hii haiwezi kuzidi saa 24" }, { status: 400 });
  }

  // Casual: proportional of daily_rate (4.5h = half day, 9h = full day)
  // Fulltime: (monthly_salary / 28 / 9) * hours
  let amount: number;
  if (emp.type === "casual") {
    amount = Math.round((overtimeHours / 9) * emp.daily_rate);
  } else {
    amount = Math.round((emp.monthly_salary / 28 / 9) * overtimeHours);
  }

  if (amount <= 0) {
    return NextResponse.json({ error: "Saa za overtime hazitoshi kukokotoa malipo" }, { status: 400 });
  }

  const id = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO overtime_entries (id, employee_id, date, hours, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, employee_id, date, overtimeHours, amount, notes?.trim() || null, session.user.id!],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ id, employee_id, date, hours: overtimeHours, amount }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const entryResult = await db.execute({
    sql: `SELECT oe.date, e.company_id
          FROM overtime_entries oe
          JOIN employees e ON e.id = oe.employee_id
          WHERE oe.id = ?`,
    args: [id],
  });
  if (!entryResult.rows.length) {
    return NextResponse.json({ error: "Overtime haijapatikana" }, { status: 404 });
  }

  const entry = entryResult.rows[0] as unknown as { date: string; company_id: string | null };
  if (await isPayrollLocked(entry.date, entry.company_id ?? null)) {
    return NextResponse.json({ error: "Payroll ya mwezi huu imefungwa; fungua kipindi kabla ya kufuta overtime" }, { status: 400 });
  }

  await db.execute({ sql: "DELETE FROM overtime_entries WHERE id = ?", args: [id] });
  return NextResponse.json({ success: true });
}
