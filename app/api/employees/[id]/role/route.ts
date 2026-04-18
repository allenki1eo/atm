import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = (session.user as { role: string }).role;
  if (callerRole !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: "promote" | "demote" };

  if (action !== "promote" && action !== "demote") {
    return NextResponse.json({ error: "action must be 'promote' or 'demote'" }, { status: 400 });
  }

  const userRes = await db.execute({
    sql: "SELECT id, role FROM users WHERE employee_id = ?",
    args: [id],
  });
  const user = userRes.rows[0] as unknown as { id: string; role: string } | undefined;
  if (!user) {
    return NextResponse.json(
      { error: "Mfanyakazi huyu hana akaunti ya kuingia. Mfungulie akaunti kwanza." },
      { status: 400 }
    );
  }

  if (action === "promote") {
    if (user.role !== "employee") {
      return NextResponse.json(
        { error: `Huwezi kubadilisha wadhifa wa ${user.role} kuwa supervisor.` },
        { status: 400 }
      );
    }
    await db.execute({
      sql: "UPDATE users SET role = 'supervisor' WHERE id = ?",
      args: [user.id],
    });
    return NextResponse.json({ success: true, role: "supervisor" });
  }

  if (user.role !== "supervisor") {
    return NextResponse.json(
      { error: "Mfanyakazi huyu si supervisor." },
      { status: 400 }
    );
  }

  await db.execute({
    sql: "UPDATE employees SET supervisor_id = NULL WHERE supervisor_id = ?",
    args: [user.id],
  });
  await db.execute({
    sql: "DELETE FROM supervisor_sections WHERE supervisor_id = ?",
    args: [user.id],
  });
  await db.execute({
    sql: "UPDATE users SET role = 'employee' WHERE id = ?",
    args: [user.id],
  });

  return NextResponse.json({ success: true, role: "employee" });
}
