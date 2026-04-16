import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");

  let sql: string;
  let args: (string | number)[];

  if (employeeId) {
    sql = `SELECT s.*, e.name as employee_name, e.phone as employee_phone
           FROM advance_schedules s
           JOIN employees e ON e.id = s.employee_id
           WHERE s.employee_id = ?
           ORDER BY s.created_at DESC`;
    args = [employeeId];
  } else {
    sql = `SELECT s.*, e.name as employee_name, e.phone as employee_phone
           FROM advance_schedules s
           JOIN employees e ON e.id = s.employee_id
           ORDER BY s.created_at DESC`;
    args = [];
  }

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { employee_id, total_debt, monthly_deduction, notes } = body;

  if (!employee_id || !total_debt || !monthly_deduction) {
    return NextResponse.json(
      { error: "employee_id, total_debt, and monthly_deduction are required" },
      { status: 400 }
    );
  }

  if (total_debt <= 0 || monthly_deduction <= 0) {
    return NextResponse.json({ error: "Amounts must be positive" }, { status: 400 });
  }

  if (monthly_deduction > total_debt) {
    return NextResponse.json(
      { error: "Monthly deduction cannot exceed total debt" },
      { status: 400 }
    );
  }

  // Check for existing active schedules
  const existingResult = await db.execute({
    sql: "SELECT id, remaining_debt, total_debt FROM advance_schedules WHERE employee_id = ? AND status = 'active'",
    args: [employee_id],
  });

  const existingSchedules = existingResult.rows as unknown as {
    id: string;
    remaining_debt: number;
    total_debt: number;
  }[];

  const totalExistingDebt = existingSchedules.reduce((sum, s) => sum + s.remaining_debt, 0);

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO advance_schedules (id, employee_id, total_debt, monthly_deduction, remaining_debt, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, employee_id, total_debt, monthly_deduction, total_debt, notes ?? null, session.user.id!],
  });

  const result = await db.execute({
    sql: `SELECT s.*, e.name as employee_name
          FROM advance_schedules s
          JOIN employees e ON e.id = s.employee_id
          WHERE s.id = ?`,
    args: [id],
  });

  return NextResponse.json(
    {
      schedule: result.rows[0],
      warning:
        existingSchedules.length > 0
          ? `Tahadhari: Mfanyakazi huyu ana deni linaloendelea la ${totalExistingDebt.toLocaleString()} TZS. Deni jipya limeongezwa.`
          : null,
    },
    { status: 201 }
  );
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { id, remaining_debt, status } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: string[] = [];
  const args: (string | number)[] = [];

  if (remaining_debt !== undefined) {
    updates.push("remaining_debt = ?");
    args.push(remaining_debt);
  }

  if (status) {
    updates.push("status = ?");
    args.push(status);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE advance_schedules SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  const result = await db.execute({
    sql: "SELECT * FROM advance_schedules WHERE id = ?",
    args: [id],
  });

  return NextResponse.json(result.rows[0]);
}
