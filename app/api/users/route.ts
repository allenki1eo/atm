import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.execute(
    "SELECT id, name, role, email, phone, employee_id, created_at FROM users ORDER BY name"
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role: string }).role;
  if (callerRole !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  await ensureDatabase();

  const body = await request.json();
  const { name, phone, email, role, password } = body;

  if (!name || !role || !password) {
    return NextResponse.json({ error: "name, role, and password are required" }, { status: 400 });
  }
  if (!["supervisor", "hr", "admin"].includes(role)) {
    return NextResponse.json({ error: "Role must be supervisor, hr, or admin" }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "Phone or email is required for login" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = nanoid();

  try {
    await db.execute({
      sql: "INSERT INTO users (id, name, role, phone, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, name, role, phone ?? null, email ?? null, passwordHash],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Nambari ya simu au barua pepe tayari inatumika" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await db.execute({
    sql: "SELECT id, name, role, phone, email, created_at FROM users WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ ...result.rows[0], plainPassword: password }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role: string }).role;
  if (callerRole !== "admin" && callerRole !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  // id = user id (staff), OR employee_id = look up user by employee record
  const { id, employee_id, name, role, phone, email, password } = body;

  let resolvedId = id as string | undefined;
  let targetRole: string | null = null;

  if (!resolvedId && employee_id) {
    const found = await db.execute({
      sql: "SELECT id, role FROM users WHERE employee_id = ?",
      args: [employee_id],
    });
    if (!found.rows.length) {
      return NextResponse.json({ error: "Mfanyakazi hana akaunti ya kuingia" }, { status: 404 });
    }
    const foundUser = found.rows[0] as unknown as { id: string; role: string };
    resolvedId = foundUser.id;
    targetRole = foundUser.role;
  } else if (resolvedId) {
    const found = await db.execute({
      sql: "SELECT role FROM users WHERE id = ?",
      args: [resolvedId],
    });
    if (found.rows.length) {
      targetRole = (found.rows[0] as unknown as { role: string }).role;
    }
  }

  // HR can only update employee-role users; admin can update anyone
  if (callerRole === "hr" && targetRole !== "employee") {
    return NextResponse.json({ error: "HR can only reset passwords for employees" }, { status: 403 });
  }

  if (!resolvedId) return NextResponse.json({ error: "id au employee_id inahitajika" }, { status: 400 });

  const updates: string[] = [];
  const args: (string | null)[] = [];

  if (name) { updates.push("name = ?"); args.push(name); }
  if (role) { updates.push("role = ?"); args.push(role); }
  if (phone !== undefined) { updates.push("phone = ?"); args.push(phone ?? null); }
  if (email !== undefined) { updates.push("email = ?"); args.push(email ?? null); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    updates.push("password_hash = ?");
    args.push(hash);
  }

  if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  args.push(resolvedId);
  try {
    await db.execute({ sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`, args });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Nambari ya simu au barua pepe tayari inatumika" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await db.execute({
    sql: "SELECT id, name, role, phone, email FROM users WHERE id = ?",
    args: [resolvedId],
  });
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role: string }).role;
  if (callerRole !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === session.user.id) {
    return NextResponse.json({ error: "Huwezi kufuta akaunti yako mwenyewe" }, { status: 400 });
  }

  const check = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [id],
  });
  if (check.rows.length === 0) {
    return NextResponse.json({ error: "Mtumiaji hajapatikana" }, { status: 404 });
  }
  const target = check.rows[0] as unknown as { employee_id: string | null };
  if (target.employee_id) {
    return NextResponse.json(
      { error: "Huwezi kufuta mtumiaji aliyeunganishwa na mfanyakazi. Futa mfanyakazi badala yake." },
      { status: 400 }
    );
  }

  try {
    await db.execute({
      sql: "UPDATE employees SET supervisor_id = NULL WHERE supervisor_id = ?",
      args: [id],
    });
    await db.execute({
      sql: "DELETE FROM supervisor_sections WHERE supervisor_id = ?",
      args: [id],
    });
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    if (msg.toUpperCase().includes("FOREIGN KEY") || msg.includes("constraint")) {
      return NextResponse.json(
        {
          error:
            "Huwezi kufuta mtumiaji huyu kwa sababu ana kumbukumbu za mfumo (mahudhurio, matangazo, au ruhusa). Badilisha wadhifa wake badala yake.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
