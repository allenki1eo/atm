import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { getLinkedEmployeeId } from "@/lib/authorization";
import { db, ensureDatabase } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id!;
  const employeeId = await getLinkedEmployeeId(userId);

  const userResult = await db.execute({
    sql: "SELECT id, name, email, phone, role FROM users WHERE id = ?",
    args: [userId],
  });
  const employeeResult = employeeId
    ? await db.execute({
        sql: `SELECT id, name, phone, department, emergency_contact_name, emergency_contact_phone
              FROM employees
              WHERE id = ?`,
        args: [employeeId],
      })
    : null;

  return NextResponse.json({
    user: userResult.rows[0] ?? null,
    employee: employeeResult?.rows[0] ?? null,
  });
}

async function _PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id!;
  const employeeId = await getLinkedEmployeeId(userId);
  const body = await request.json();
  const {
    email,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    current_password,
    new_password,
  } = body as {
    email?: string | null;
    phone?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    current_password?: string;
    new_password?: string;
  };

  if (new_password && new_password.length < 4) {
    return NextResponse.json(
      { error: "PIN mpya lazima iwe na angalau herufi 4" },
      { status: 400 }
    );
  }

  const updates: string[] = [];
  const args: (string | null)[] = [];

  if (email !== undefined) {
    updates.push("email = ?");
    args.push(email?.trim() || null);
  }
  if (phone !== undefined) {
    updates.push("phone = ?");
    args.push(phone?.trim() || null);
  }

  if (new_password) {
    const userResult = await db.execute({
      sql: "SELECT password_hash FROM users WHERE id = ?",
      args: [userId],
    });
    const user = userResult.rows[0] as unknown as
      | { password_hash: string }
      | undefined;
    if (!user || !current_password) {
      return NextResponse.json(
        { error: "PIN ya sasa inahitajika" },
        { status: 400 }
      );
    }
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "PIN ya sasa si sahihi" },
        { status: 403 }
      );
    }
    updates.push("password_hash = ?");
    args.push(await bcrypt.hash(new_password, 10));
  }

  try {
    if (updates.length > 0) {
      await db.execute({
        sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        args: [...args, userId],
      });
    }

    if (employeeId) {
      await db.execute({
        sql: `UPDATE employees
              SET phone = COALESCE(?, phone),
                  emergency_contact_name = ?,
                  emergency_contact_phone = ?
              WHERE id = ?`,
        args: [
          phone?.trim() || null,
          emergency_contact_name?.trim() || null,
          emergency_contact_phone?.trim() || null,
          employeeId,
        ],
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Simu au barua pepe tayari inatumika" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return GET();
}

export const GET = apiHandler(_GET);
export const PUT = apiHandler(_PUT);
