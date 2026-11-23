import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { getTodayDate } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const date = dateParam ?? getTodayDate();

  const userId = session.user.id!;
  const role = (session.user as { role: string }).role;

  let sql: string;
  let args: string[];

  if (role === "supervisor") {
    sql = `
      SELECT
        e.id as employee_id,
        e.name as employee_name,
        e.phone,
        e.type,
        e.department,
        e.company_id,
        e.section_id,
        e.deduct_nssf,
        c.name as company_name,
        s.name as section_name,
        a.id,
        a.date,
        a.status,
        a.marked_by,
        a.marked_at,
        a.notes,
        a.is_locked,
        a.check_in_at,
        a.check_out_at,
        a.times_updated_by,
        a.times_updated_at,
        tu.name as times_updated_by_name
      FROM employees e
      LEFT JOIN companies c ON c.id = e.company_id
      LEFT JOIN sections s ON s.id = e.section_id
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      LEFT JOIN users tu ON tu.id = a.times_updated_by
      WHERE e.supervisor_id = ? AND e.active = 1
      ORDER BY c.name, s.name, e.name
    `;
    args = [date, userId];
  } else {
    sql = `
      SELECT
        e.id as employee_id,
        e.name as employee_name,
        e.phone,
        e.type,
        e.department,
        e.company_id,
        e.section_id,
        e.deduct_nssf,
        c.name as company_name,
        s.name as section_name,
        a.id,
        a.date,
        a.status,
        a.marked_by,
        a.marked_at,
        a.notes,
        a.is_locked,
        a.check_in_at,
        a.check_out_at,
        a.times_updated_by,
        a.times_updated_at,
        tu.name as times_updated_by_name
      FROM employees e
      LEFT JOIN companies c ON c.id = e.company_id
      LEFT JOIN sections s ON s.id = e.section_id
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      LEFT JOIN users tu ON tu.id = a.times_updated_by
      WHERE e.active = 1
      ORDER BY c.name, s.name, e.name
    `;
    args = [date];
  }

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}
