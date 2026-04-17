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

  const companyId = request.nextUrl.searchParams.get("company_id");

  const result = companyId
    ? await db.execute({
        sql: `SELECT pp.*, c.name AS company_name
              FROM payroll_periods pp
              LEFT JOIN companies c ON c.id = pp.company_id
              WHERE pp.company_id = ?
              ORDER BY pp.year DESC, pp.month DESC`,
        args: [companyId],
      })
    : await db.execute(
        `SELECT pp.*, c.name AS company_name
         FROM payroll_periods pp
         LEFT JOIN companies c ON c.id = pp.company_id
         ORDER BY pp.year DESC, pp.month DESC`
      );
  return NextResponse.json(result.rows);
}
