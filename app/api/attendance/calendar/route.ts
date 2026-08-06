import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, overtimeDaysFromHours } from "@/lib/overtime";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  if (!employeeId) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const result = await db.execute({
    sql: `SELECT date, status, notes, is_locked, marked_at
          FROM attendance
          WHERE employee_id = ? AND date >= ? AND date <= ?
          ORDER BY date`,
    args: [employeeId, startDate, endDate],
  });

  // Build summary
  const records = result.rows as unknown as {
    date: string;
    status: string;
    notes: string;
    is_locked: number;
    marked_at: string;
  }[];

  // Overtime hours per day, so the calendar can flag days worked beyond schedule.
  // Wrapped: older databases may predate the overtime_entries table.
  let overtime: { date: string; hours: number; amount: number }[] = [];
  try {
    const overtimeResult = await db.execute({
      sql: `SELECT date, SUM(hours) as hours, SUM(amount) as amount
            FROM overtime_entries
            WHERE employee_id = ? AND date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date`,
      args: [employeeId, startDate, endDate],
    });
    overtime = (overtimeResult.rows as unknown as { date: string; hours: number; amount: number }[]).map(
      (r) => ({ date: r.date, hours: Number(r.hours), amount: Number(r.amount) })
    );
  } catch {
    overtime = [];
  }

  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  const halfDay = records.filter((r) => r.status === "half_day").length;

  // Days counted: a late day still counts as worked, a half day as 0.5, and
  // overtime adds day equivalents on top (9h = 1 day), same as casual payroll.
  const overtimeHours = overtime.reduce((sum, o) => sum + o.hours, 0);
  const overtimeDays = overtimeDaysFromHours(overtimeHours);
  const attendanceDays = addDays(present, late, halfDay * 0.5);

  const summary = {
    present,
    absent: records.filter((r) => r.status === "absent").length,
    late,
    half_day: halfDay,
    total_days: records.length,
    attendance_days: attendanceDays,
    /** Number of dates carrying at least one overtime entry. */
    overtime_dates: overtime.length,
    overtime_hours: overtimeHours,
    /** Overtime expressed in days (hours / 9). */
    overtime_days: overtimeDays,
    days_worked: addDays(attendanceDays, overtimeDays),
  };

  return NextResponse.json({ records, overtime, summary, year, month });
}
