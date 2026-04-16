import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDatabase();
    const result = await db.execute("SELECT * FROM companies ORDER BY name");
    return NextResponse.json(result.rows);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { name, address, cotwu_rate } = body;

  if (!name) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  try {
    await ensureDatabase();
    const id = nanoid();
    await db.execute({
      sql: "INSERT INTO companies (id, name, address, cotwu_rate) VALUES (?, ?, ?, ?)",
      args: [id, name, address ?? null, cotwu_rate ?? 2],
    });
    const result = await db.execute({ sql: "SELECT * FROM companies WHERE id = ?", args: [id] });
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

  const body = await request.json();
  const { id, name, address, cotwu_rate } = body;
  if (!id || !name) return NextResponse.json({ error: "id and name required" }, { status: 400 });

  try {
    await ensureDatabase();
    await db.execute({
      sql: "UPDATE companies SET name = ?, address = ?, cotwu_rate = ? WHERE id = ?",
      args: [name, address ?? null, cotwu_rate ?? 2, id],
    });
    const result = await db.execute({ sql: "SELECT * FROM companies WHERE id = ?", args: [id] });
    if (!result.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await ensureDatabase();
    await db.execute({ sql: "DELETE FROM companies WHERE id = ?", args: [id] });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Database error" }, { status: 500 });
  }
}
