import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, overtimeDaysFromHours } from "@/lib/overtime";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id"); // optional
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = new Date(year, month, 0).toISOString().split("T")[0];

  const result = await db.execute({
    sql: `SELECT
            e.id        AS employee_id,
            e.name      AS employee_name,
            e.department,
            e.company_id,
            e.section_id,
            c.name      AS company_name,
            SUM(CASE WHEN a.status = 'present'  THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status = 'absent'   THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status = 'late'     THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN a.status = 'half_day' THEN 1 ELSE 0 END) AS half_day,
            COUNT(a.id) AS total
          FROM employees e
          LEFT JOIN companies c ON c.id = e.company_id
          LEFT JOIN attendance a ON a.employee_id = e.id
            AND a.date >= ? AND a.date <= ?
          WHERE e.active = 1
            ${companyId ? "AND e.company_id = ?" : ""}
          GROUP BY e.id
          ORDER BY c.name, e.name`,
    args: companyId ? [startDate, endDate, companyId] : [startDate, endDate],
  });

  // Overtime hours per employee for the same window. Queried separately so a
  // database predating overtime_entries still returns the attendance summary.
  const overtimeHoursByEmployee = new Map<string, number>();
  try {
    const overtimeResult = await db.execute({
      sql: `SELECT employee_id, COALESCE(SUM(hours), 0) AS hours
            FROM overtime_entries
            WHERE date >= ? AND date <= ?
            GROUP BY employee_id`,
      args: [startDate, endDate],
    });
    for (const row of overtimeResult.rows as unknown as { employee_id: string; hours: number }[]) {
      overtimeHoursByEmployee.set(row.employee_id, Number(row.hours ?? 0));
    }
  } catch {
    // table not present yet — every employee simply has no overtime
  }

  type SummaryRow = {
    employee_id: string;
    present: number;
    late: number;
    half_day: number;
  };

  // Days counted mirror casual payroll: present and late are full days, half
  // days count 0.5, and overtime adds day equivalents (9h = 1 day) on top.
  const rows = (result.rows as unknown as SummaryRow[]).map((row) => {
    const overtimeHours = overtimeHoursByEmployee.get(row.employee_id) ?? 0;
    const overtimeDays = overtimeDaysFromHours(overtimeHours);
    const attendanceDays = addDays(row.present, row.late, (row.half_day ?? 0) * 0.5);
    return {
      ...row,
      attendance_days: attendanceDays,
      overtime_hours: overtimeHours,
      overtime_days: overtimeDays,
      days_worked: addDays(attendanceDays, overtimeDays),
    };
  });

  return NextResponse.json(rows);
}
