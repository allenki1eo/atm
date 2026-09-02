import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { apiHandler } from "@/lib/api-handler";

async function _GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin" && role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");

  if (employeeId) {
    const result = await db.execute({
      sql: "SELECT * FROM service_certificates WHERE employee_id = ? ORDER BY issued_at DESC LIMIT 1",
      args: [employeeId],
    });
    return NextResponse.json(result.rows[0] ?? null);
  }

  const result = await db.execute(
    "SELECT sc.*, e.name as employee_name FROM service_certificates sc JOIN employees e ON sc.employee_id = e.id ORDER BY sc.issued_at DESC"
  );
  return NextResponse.json(result.rows);
}

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin" && role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const body = await request.json();
  const {
    employee_id, date_employed, date_of_leaving,
    position_held, general_conduct, efficiency, additional_notes,
  } = body;

  if (!employee_id) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO service_certificates
      (id, employee_id, date_employed, date_of_leaving, position_held, general_conduct, efficiency, additional_notes, issued_by, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: [
      id,
      employee_id,
      date_employed ?? null,
      date_of_leaving ?? null,
      position_held ?? null,
      general_conduct ?? "Good",
      efficiency ?? "Good",
      additional_notes ?? null,
      session.user.id!,
    ],
  });

  const result = await db.execute({
    sql: "SELECT * FROM service_certificates WHERE id = ?",
    args: [id],
  });
  return NextResponse.json(result.rows[0], { status: 201 });
}

export const GET = apiHandler(_GET);
export const POST = apiHandler(_POST);
