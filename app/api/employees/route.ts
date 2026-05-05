import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { sendSMS } from "@/lib/at";

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const FOOD_ADVANCE_AMOUNTS = new Set([0, 20000, 25000, 30000, 35000]);

function normalizeFoodAdvance(value: unknown) {
  const amount = Math.round(Number(value ?? 0));
  return FOOD_ADVANCE_AMOUNTS.has(amount) ? amount : 0;
}

interface EmployeeRow {
  id: string;
  active: number | null;
  company_id: string | null;
  section_id: string | null;
}

function normalizeOptionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeActive(value: unknown, fallback: number) {
  return value === undefined || value === null ? fallback : value ? 1 : 0;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const search = searchParams.get("search");
  const supervisorId = searchParams.get("supervisor_id");
  const includeInactive = searchParams.get("include_inactive") === "1";

  const role = (session.user as { role: string }).role;

  let sql =
    includeInactive && (role === "hr" || role === "admin")
      ? "SELECT * FROM employees WHERE 1 = 1"
      : "SELECT * FROM employees WHERE active = 1";
  const args: string[] = [];

  if (role === "employee") {
    // Employees only see their own record. Resolve from DB (JWT may be stale).
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [session.user.id!],
    });
    const employeeId =
      (userRes.rows[0] as unknown as { employee_id: string | null } | undefined)
        ?.employee_id ?? null;
    if (!employeeId) return NextResponse.json([]);
    sql += " AND id = ?";
    args.push(employeeId);
  } else if (role === "supervisor") {
    // Supervisors see only employees they supervise.
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
  await ensureDatabase();

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
    company_id,
    section_id,
    daily_rate = 0,
    monthly_salary = 0,
    food_advance_amount = 0,
    overtime_rule = "none",
  } = body;

  if (!name || !phone || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const employeeId = nanoid();
  const foodAdvanceAmount = normalizeFoodAdvance(food_advance_amount);

  // 1. Create employee record
  try {
    await db.execute({
      sql: `INSERT INTO employees (id, name, phone, type, department, supervisor_id, company_id, section_id, daily_rate, monthly_salary, food_advance_amount, overtime_rule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        employeeId, name, phone, type,
        department ?? null,
        supervisor_id ?? null,
        company_id ?? null,
        section_id ?? null,
        daily_rate ?? 0,
        monthly_salary ?? 0,
        foodAdvanceAmount,
        overtime_rule ?? "none",
      ],
    });
    await db.execute({
      sql: `INSERT INTO employee_status_events
            (id, employee_id, action, from_active, to_active, note, changed_by)
            VALUES (?, ?, 'created', NULL, 1, ?, ?)`,
      args: [nanoid(), employeeId, "Employee record created", session.user.id ?? null],
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
        `Ingia kwa nambari yako: ${phone}. ` +
        `PIN: ${pin}. Usishiriki PIN hii. ` +
        `Ingia hapa: https://atwork.eastafricanspirit.co.tz/login`;

      const smsResult = await sendSMS(phone, message, {
        sentBy: session.user.id ?? null,
        source: "new_employee_credentials",
      });
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
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    id, name, phone, type, department, supervisor_id, company_id, section_id,
    daily_rate, monthly_salary, food_advance_amount, overtime_rule, active,
    deduct_nssf, deduct_cotwu, deduct_fadhila, heslb_amount, wcf_amount,
  } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const foodAdvanceAmount = normalizeFoodAdvance(food_advance_amount);
  const existing = await db.execute({
    sql: "SELECT id, active, company_id, section_id FROM employees WHERE id = ?",
    args: [id],
  });
  const current = existing.rows[0] as unknown as EmployeeRow | undefined;
  if (!current) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const currentActive = Number(current.active ?? 1) ? 1 : 0;
  const nextActive = normalizeActive(active, currentActive);
  const nextCompanyId = normalizeOptionalId(company_id);
  const nextSectionId = normalizeOptionalId(section_id);
  const moved =
    (current.company_id ?? null) !== nextCompanyId ||
    (current.section_id ?? null) !== nextSectionId;

  try {
    await db.execute({
      sql: `UPDATE employees
            SET name=?, phone=?, type=?, department=?, supervisor_id=?, company_id=?,
                section_id=?, daily_rate=?, monthly_salary=?, food_advance_amount=?, overtime_rule=?, active=?,
                deduct_nssf=?, deduct_cotwu=?, deduct_fadhila=?, heslb_amount=?, wcf_amount=?
            WHERE id=?`,
      args: [
        name, phone, type, department ?? null, supervisor_id ?? null, nextCompanyId,
        nextSectionId, daily_rate ?? 0, monthly_salary ?? 0, foodAdvanceAmount, overtime_rule ?? "none", nextActive,
        deduct_nssf ? 1 : 0, deduct_cotwu ? 1 : 0, deduct_fadhila ? 1 : 0,
        heslb_amount ?? 0, wcf_amount ?? 0, id,
      ],
    });
    if (currentActive !== nextActive) {
      await db.execute({
        sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          nanoid(),
          id,
          nextActive ? "rejoined" : "deactivated",
          currentActive,
          nextActive,
          nextActive ? "Employee rejoined" : "Employee marked inactive",
          session.user.id ?? null,
        ],
      });
    }
    if (moved) {
      await db.execute({
        sql: `INSERT INTO employee_transfer_history
              (id, employee_id, from_company_id, from_section_id, to_company_id, to_section_id, changed_by, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          nanoid(),
          id,
          current.company_id ?? null,
          current.section_id ?? null,
          nextCompanyId,
          nextSectionId,
          session.user.id ?? null,
          "Employee company/section assignment changed",
        ],
      });
    }
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
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const existing = await db.execute({
      sql: "SELECT id, active FROM employees WHERE id = ?",
      args: [id],
    });
    const current = existing.rows[0] as unknown as EmployeeRow | undefined;
    if (!current) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const currentActive = Number(current.active ?? 1) ? 1 : 0;

    // Soft-delete: preserve attendance/payroll history
    await db.execute({
      sql: "UPDATE employees SET active = 0 WHERE id = ?",
      args: [id],
    });
    if (currentActive !== 0) {
      await db.execute({
        sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
              VALUES (?, ?, 'deactivated', ?, 0, ?, ?)`,
        args: [
          nanoid(),
          id,
          currentActive,
          "Employee deactivated from employee page",
          session.user.id ?? null,
        ],
      });
    }
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
