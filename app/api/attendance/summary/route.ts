import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _GET(request: NextRequest) {
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

  return NextResponse.json(result.rows);
}

export const GET = apiHandler(_GET);
