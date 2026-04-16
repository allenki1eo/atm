import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { sendSMS } from "@/lib/at";

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

  const employeeId = nanoid();

  // 1. Create employee record
  try {
    await db.execute({
      sql: `INSERT INTO employees (id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        employeeId, name, phone, type,
        department ?? null,
        supervisor_id ?? null,
        daily_rate ?? 0,
        monthly_salary ?? 0,
        overtime_rule ?? "none",
      ],
    });
  } catch (err) {
    console.error("Employee insert error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }

  // 2. Create user login account (if phone not already registered)
  let pin: string | null = null;
  let smsSent = false;

  const existingUser = await db.execute({
    sql: "SELECT id FROM users WHERE phone = ?",
    args: [phone],
  });

  if (existingUser.rows.length === 0) {
    pin = generatePIN();
    const passwordHash = await bcrypt.hash(pin, 10);
    const userId = nanoid();

    try {
      await db.execute({
        sql: `INSERT INTO users (id, name, role, phone, password_hash, employee_id)
              VALUES (?, ?, 'employee', ?, ?, ?)`,
        args: [userId, name, phone, passwordHash, employeeId],
      });

      // 3. Send SMS with login credentials
      const message =
        `Karibu TrustTrack! Jina: ${name}. ` +
        `Ingia kwa nambari yako ya simu: ${phone}. ` +
        `PIN yako ya siri: ${pin}. ` +
        `Usishiriki PIN hii na mtu yeyote.`;

      const smsResult = await sendSMS(phone, message);
      smsSent = smsResult.success;
    } catch (err) {
      // User creation failed but employee was created — non-fatal
      console.error("User account creation error:", err);
    }
  }

  const result = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [employeeId],
  });

  return NextResponse.json({ ...result.rows[0], pin, smsSent }, { status: 201 });
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

  try {
    await db.execute({
      sql: `UPDATE employees SET name=?, phone=?, type=?, department=?, supervisor_id=?, daily_rate=?, monthly_salary=?, overtime_rule=?, active=? WHERE id=?`,
      args: [name, phone, type, department ?? null, supervisor_id ?? null, daily_rate ?? 0, monthly_salary ?? 0, overtime_rule ?? "none", active ?? 1, id],
    });
  } catch (err) {
    console.error("Employee update error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }

  const result = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [id],
  });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    // Soft-delete: preserve attendance/payroll history
    await db.execute({
      sql: "UPDATE employees SET active = 0 WHERE id = ?",
      args: [id],
    });
    // Also deactivate linked user account
    await db.execute({
      sql: "UPDATE users SET role = 'employee' WHERE employee_id = ?",
      args: [id],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
