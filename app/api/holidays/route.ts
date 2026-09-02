import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { apiHandler } from "@/lib/api-handler";

async function _GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const companyId = request.nextUrl.searchParams.get("company_id");
  const result = companyId
    ? await db.execute({
        sql: `SELECT h.*, c.name AS company_name
              FROM holidays h LEFT JOIN companies c ON c.id = h.company_id
              WHERE h.company_id IS NULL OR h.company_id = ?
              ORDER BY h.date DESC`,
        args: [companyId],
      })
    : await db.execute(
        `SELECT h.*, c.name AS company_name
         FROM holidays h LEFT JOIN companies c ON c.id = h.company_id
         ORDER BY h.date DESC`
      );
  return NextResponse.json(result.rows);
}

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const body = await request.json();
  const { date, name, company_id } = body as {
    date?: string;
    name?: string;
    company_id?: string | null;
  };

  if (!date || !name) {
    return NextResponse.json({ error: "date and name required" }, { status: 400 });
  }

  const id = nanoid();
  try {
    await db.execute({
      sql: `INSERT INTO holidays (id, date, name, company_id) VALUES (?, ?, ?, ?)`,
      args: [id, date, name, company_id ?? null],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ id, date, name, company_id: company_id ?? null }, { status: 201 });
}

export const GET = apiHandler(_GET);
export const POST = apiHandler(_POST);
