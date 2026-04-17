import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;

  if (role === "employee") {
    const userResult = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [userId],
    });
    const row = userResult.rows[0] as unknown as { employee_id: string | null } | undefined;
    const employeeId = row?.employee_id;
    if (!employeeId) return NextResponse.json([]);

    const result = await db.execute({
      sql: `SELECT c.*, e.name as employee_name
            FROM complaints c
            JOIN employees e ON e.id = c.employee_id
            WHERE c.employee_id = ?
            ORDER BY c.created_at DESC`,
      args: [employeeId],
    });
    return NextResponse.json(result.rows);
  }

  // HR/Admin/Supervisor see all complaints
  const result = await db.execute({
    sql: `SELECT c.*, e.name as employee_name, e.phone as employee_phone
          FROM complaints c
          JOIN employees e ON e.id = c.employee_id
          ORDER BY
            CASE WHEN c.status = 'open' THEN 0 ELSE 1 END,
            c.created_at DESC`,
    args: [],
  });
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const body = await request.json();
  const { subject, message } = body;

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "Subject and message are required" },
      { status: 400 }
    );
  }

  const userId = session.user.id!;
  const userResult = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [userId],
  });
  const row = userResult.rows[0] as unknown as { employee_id: string | null } | undefined;
  const employeeId = row?.employee_id;

  if (!employeeId) {
    return NextResponse.json(
      { error: "Akaunti yako haijaunganishwa na rekodi ya mfanyakazi." },
      { status: 400 }
    );
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO complaints (id, employee_id, subject, message, status)
          VALUES (?, ?, ?, ?, 'open')`,
    args: [id, employeeId, subject.trim(), message.trim()],
  });

  const result = await db.execute({
    sql: "SELECT * FROM complaints WHERE id = ?",
    args: [id],
  });
  return NextResponse.json(result.rows[0], { status: 201 });
}
