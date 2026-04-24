import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("period_id");

  if (!periodId) return NextResponse.json({ error: "period_id required" }, { status: 400 });

  const result = await db.execute({
    sql: `SELECT ps.*,
            e.name AS employee_name,
            e.type AS employee_type,
            e.department AS employee_department
          FROM payslips ps
          JOIN employees e ON e.id = ps.employee_id
          WHERE ps.period_id = ?
          ORDER BY e.name`,
    args: [periodId],
  });

  return NextResponse.json(result.rows);
}
