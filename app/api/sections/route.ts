import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDatabase();
  const { searchParams } = new URL(request.url);
  const company_id = searchParams.get("company_id");

  let sql = "SELECT * FROM sections";
  const args: string[] = [];

  if (company_id) {
    sql += " WHERE company_id = ?";
    args.push(company_id);
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
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { company_id, name } = body;

  if (!company_id || !name) {
    return NextResponse.json({ error: "company_id and name are required" }, { status: 400 });
  }

  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO sections (id, company_id, name) VALUES (?, ?, ?)",
    args: [id, company_id, name],
  });

  const result = await db.execute({
    sql: "SELECT * FROM sections WHERE id = ?",
    args: [id],
  });

  return NextResponse.json(result.rows[0], { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, company_id, supervisor_ids } = body;

  if (!id) {
    return NextResponse.json({ error: "Section id is required" }, { status: 400 });
  }

  // Handle supervisor assignment
  if (Array.isArray(supervisor_ids)) {
    // Replace all supervisor_sections for this section
    await db.execute({
      sql: "DELETE FROM supervisor_sections WHERE section_id = ?",
      args: [id],
    });

    for (const supervisor_id of supervisor_ids) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO supervisor_sections (supervisor_id, section_id) VALUES (?, ?)",
        args: [supervisor_id, id],
      });
    }

    const result = await db.execute({
      sql: "SELECT * FROM sections WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  }

  // Normal field update
  if (!name || !company_id) {
    return NextResponse.json({ error: "name and company_id are required" }, { status: 400 });
  }

  await db.execute({
    sql: "UPDATE sections SET name = ?, company_id = ? WHERE id = ?",
    args: [name, company_id, id],
  });

  const result = await db.execute({
    sql: "SELECT * FROM sections WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Section id is required" }, { status: 400 });
  }

  await db.execute({
    sql: "DELETE FROM supervisor_sections WHERE section_id = ?",
    args: [id],
  });

  await db.execute({
    sql: "DELETE FROM sections WHERE id = ?",
    args: [id],
  });

  return NextResponse.json({ success: true });
}
