import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTodayDate } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getTodayDate();
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
        a.id,
        a.date,
        a.status,
        a.marked_by,
        a.marked_at,
        a.notes,
        a.is_locked
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.supervisor_id = ? AND e.active = 1
      ORDER BY e.name
    `;
    args = [today, userId];
  } else {
    sql = `
      SELECT
        e.id as employee_id,
        e.name as employee_name,
        e.phone,
        e.type,
        e.department,
        a.id,
        a.date,
        a.status,
        a.marked_by,
        a.marked_at,
        a.notes,
        a.is_locked
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.active = 1
      ORDER BY e.department, e.name
    `;
    args = [today];
  }

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}
