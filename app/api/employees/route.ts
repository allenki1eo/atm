import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const search = searchParams.get("search");
  const supervisorId = searchParams.get("supervisor_id");

  let sql = "SELECT * FROM employees WHERE active = 1";
  const args: string[] = [];

  if (session.user && (session.user as { role: string }).role === "supervisor") {
    sql += " AND supervisor_id = ?";
    args.push(session.user.id!);
  } else if (supervisorId) {
    sql += " AND supervisor_id = ?";
    args.push(supervisorId);
  }

  if (department) {
    sql += " AND department = ?";
    args.push(department);
  }

  if (search) {
    sql += " AND (name LIKE ? OR phone LIKE ?)";
    args.push(`%${search}%`, `%${search}%`);
  }

  sql += " ORDER BY name";

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

  const body = await request.json();
  const {
    name,
    phone,
    type,
    department,
    supervisor_id,
    daily_rate = 0,
    monthly_salary = 0,
    overtime_rule = "none",
  } = body;

  if (!name || !phone || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO employees (id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule],
  });

  const result = await db.execute({ sql: "SELECT * FROM employees WHERE id = ?", args: [id] });
  return NextResponse.json(result.rows[0], { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule, active } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.execute({
    sql: `UPDATE employees SET name=?, phone=?, type=?, department=?, supervisor_id=?, daily_rate=?, monthly_salary=?, overtime_rule=?, active=? WHERE id=?`,
    args: [name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule, active ?? 1, id],
  });

  const result = await db.execute({ sql: "SELECT * FROM employees WHERE id = ?", args: [id] });
  return NextResponse.json(result.rows[0]);
}
