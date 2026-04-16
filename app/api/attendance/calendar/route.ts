import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

  const summary = {
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    late: records.filter((r) => r.status === "late").length,
    half_day: records.filter((r) => r.status === "half_day").length,
    total_days: records.length,
  };

  return NextResponse.json({ records, summary, year, month });
}
