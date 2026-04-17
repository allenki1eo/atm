import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";

// Returns the current user's employee record, or null if the user
// isn't linked to one (admin/HR without an employee profile).
// Always reads from the DB — session JWT may be stale.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id;
  if (!userId) return NextResponse.json(null);

  const userRes = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [userId],
  });
  const userRow = userRes.rows[0] as unknown as { employee_id: string | null } | undefined;
  const employeeId = userRow?.employee_id ?? null;
  if (!employeeId) return NextResponse.json(null);

  const empRes = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ? AND active = 1",
    args: [employeeId],
  });
  return NextResponse.json(empRes.rows[0] ?? null);
}
