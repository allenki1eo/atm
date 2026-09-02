import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency } from "@/lib/utils";
import { apiHandler } from "@/lib/api-handler";

async function _GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;
  const statusFilter = request.nextUrl.searchParams.get("status");

  if (role === "employee") {
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [userId],
    });
    const employeeId = (userRes.rows[0] as unknown as { employee_id: string | null })?.employee_id;
    if (!employeeId) return NextResponse.json([]);

    const rows = await db.execute({
      sql: `SELECT * FROM advance_requests WHERE employee_id = ? ORDER BY requested_at DESC`,
      args: [employeeId],
    });
    return NextResponse.json(rows.rows);
  }

  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const whereClauses: string[] = [];
  const args: (string | number)[] = [];
  if (statusFilter) {
    whereClauses.push("ar.status = ?");
    args.push(statusFilter);
  }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = await db.execute({
    sql: `SELECT ar.*, e.name AS employee_name, e.phone AS employee_phone
          FROM advance_requests ar
          JOIN employees e ON e.id = ar.employee_id
          ${whereSql}
          ORDER BY ar.requested_at DESC`,
    args,
  });
  return NextResponse.json(rows.rows);
}

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id!;
  const role = (session.user as { role: string }).role;
  const body = await request.json();
  const { amount, description } = body as { amount?: number; description?: string };

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  // Resolve employee_id from session (or, for HR submitting on behalf, from body)
  let employeeId: string | null = null;
  if (role === "employee") {
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [userId],
    });
    employeeId = (userRes.rows[0] as unknown as { employee_id: string | null })?.employee_id ?? null;
    if (!employeeId) {
      return NextResponse.json(
        { error: "Akaunti yako haijaunganishwa na rekodi ya mfanyakazi. Wasiliana na HR." },
        { status: 400 }
      );
    }
  } else {
    employeeId = (body.employee_id as string | undefined) ?? null;
    if (!employeeId) {
      const userRes = await db.execute({
        sql: "SELECT employee_id FROM users WHERE id = ?",
        args: [userId],
      });
      employeeId = (userRes.rows[0] as unknown as { employee_id: string | null })?.employee_id ?? null;
    }
    if (!employeeId) {
      return NextResponse.json({ error: "employee_id is required" }, { status: 400 });
    }
  }

  const pendingCheck = await db.execute({
    sql: "SELECT id FROM advance_requests WHERE employee_id = ? AND status = 'pending'",
    args: [employeeId],
  });
  if (pendingCheck.rows.length > 0) {
    return NextResponse.json(
      { error: "Tayari una ombi la salary advance linalosubiri HR." },
      { status: 400 }
    );
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO advance_requests (id, employee_id, amount, description, status)
          VALUES (?, ?, ?, ?, 'pending')`,
    args: [id, employeeId, Math.abs(amount), description ?? null],
  });

  // Fire advance_requested SMS — confirm receipt to the employee
  const empRes = await db.execute({
    sql: "SELECT name, phone FROM employees WHERE id = ?",
    args: [employeeId],
  });
  const emp = empRes.rows[0] as unknown as { name: string; phone: string | null } | undefined;
  if (emp?.phone) {
    const msg = smsTemplates.advanceRequested(formatCurrency(Math.abs(amount)));
    await sendSMS(emp.phone, msg, {
      sentBy: userId,
      source: "advance_request",
    });
  }

  return NextResponse.json({ id, employee_id: employeeId, amount, status: "pending" }, { status: 201 });
}

export const GET = apiHandler(_GET);
export const POST = apiHandler(_POST);
