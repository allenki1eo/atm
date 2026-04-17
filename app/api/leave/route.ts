import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDatabase();
  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;
  const currentYear = new Date().getFullYear();

  let requestsSql: string;
  const requestsArgs: (string | number)[] = [];

  if (role === "employee") {
    // Get own employee_id from user record
    const userResult = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [userId],
    });
    const userRow = userResult.rows[0] as unknown as { employee_id: string | null };
    const employeeId = userRow?.employee_id ?? userId;

    requestsSql = `
      SELECT lr.*, e.name as employee_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.employee_id = ?
      ORDER BY lr.submitted_at DESC
    `;
    requestsArgs.push(employeeId);

    const [requestsResult, balanceResult] = await Promise.all([
      db.execute({ sql: requestsSql, args: requestsArgs }),
      db.execute({
        sql: "SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?",
        args: [employeeId, currentYear],
      }),
    ]);

    const balance = balanceResult.rows[0] as unknown as {
      id: string;
      employee_id: string;
      year: number;
      allowed_days: number;
      used_days: number;
    } | undefined;

    return NextResponse.json({
      requests: requestsResult.rows,
      balance: balance ?? { employee_id: employeeId, year: currentYear, allowed_days: 28, used_days: 0 },
    });
  } else if (role === "supervisor") {
    // Get sections this supervisor manages
    const sectionsResult = await db.execute({
      sql: "SELECT section_id FROM supervisor_sections WHERE supervisor_id = ?",
      args: [userId],
    });
    const sectionIds = (sectionsResult.rows as unknown as { section_id: string }[]).map(
      (r) => r.section_id
    );

    if (sectionIds.length === 0) {
      return NextResponse.json({ requests: [], balance: null });
    }

    const placeholders = sectionIds.map(() => "?").join(", ");
    requestsSql = `
      SELECT lr.*, e.name as employee_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.section_id IN (${placeholders})
      ORDER BY lr.submitted_at DESC
    `;
    const result = await db.execute({ sql: requestsSql, args: sectionIds });
    return NextResponse.json({ requests: result.rows, balance: null });
  } else {
    // hr or admin: all requests
    requestsSql = `
      SELECT lr.*, e.name as employee_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      ORDER BY lr.submitted_at DESC
    `;
    const result = await db.execute({ sql: requestsSql, args: [] });
    return NextResponse.json({ requests: result.rows, balance: null });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const body = await request.json();
  const { start_date, end_date, reason, leave_type, employee_phone } = body;
  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;

  // Resolve the employee_id server-side for employees (ignore any client value).
  // Other roles may submit on behalf by passing employee_id; they still must
  // resolve to a real employee row.
  let employee_id: string | null = null;
  if (role === "employee") {
    const userResult = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [userId],
    });
    const userRow = userResult.rows[0] as unknown as { employee_id: string | null } | undefined;
    employee_id = userRow?.employee_id ?? null;
    if (!employee_id) {
      return NextResponse.json(
        { error: "Akaunti yako haijaunganishwa na rekodi ya mfanyakazi. Wasiliana na HR." },
        { status: 400 }
      );
    }
  } else {
    employee_id = body.employee_id ?? null;
    if (!employee_id) {
      // HR/supervisor can also submit their own leave — fall back to session linkage
      const userResult = await db.execute({
        sql: "SELECT employee_id FROM users WHERE id = ?",
        args: [userId],
      });
      const userRow = userResult.rows[0] as unknown as { employee_id: string | null } | undefined;
      employee_id = userRow?.employee_id ?? null;
    }
  }

  if (!employee_id || !start_date || !end_date) {
    return NextResponse.json(
      { error: "employee_id, start_date, and end_date are required" },
      { status: 400 }
    );
  }

  // Verify employee exists (prevents orphan rows from bad client input)
  const empCheck = await db.execute({
    sql: "SELECT id FROM employees WHERE id = ? AND active = 1",
    args: [employee_id],
  });
  if (empCheck.rows.length === 0) {
    return NextResponse.json({ error: "Mfanyakazi hajapatikana" }, { status: 404 });
  }

  // Calculate days (inclusive)
  const startMs = new Date(start_date).getTime();
  const endMs = new Date(end_date).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  if (endMs < startMs) {
    return NextResponse.json({ error: "end_date must be on or after start_date" }, { status: 400 });
  }

  const days = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
  const currentYear = new Date(start_date).getFullYear();

  // Check balance
  const balanceResult = await db.execute({
    sql: "SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?",
    args: [employee_id, currentYear],
  });

  const balance = balanceResult.rows[0] as unknown as {
    id: string;
    allowed_days: number;
    used_days: number;
  } | undefined;

  const allowedDays = balance?.allowed_days ?? 28;
  const usedDays = balance?.used_days ?? 0;
  const remaining = allowedDays - usedDays;

  if (days > remaining) {
    return NextResponse.json(
      {
        error: `Insufficient leave balance. Requested ${days} days but only ${remaining} days remaining.`,
      },
      { status: 400 }
    );
  }

  const requestId = nanoid();

  await db.execute({
    sql: `INSERT INTO leave_requests (id, employee_id, start_date, end_date, days, reason, leave_type, employee_phone, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    args: [requestId, employee_id, start_date, end_date, days, reason ?? null, leave_type ?? null, employee_phone ?? null],
  });

  // Upsert leave_balances for the year
  if (balance) {
    // Already exists, no change to used_days until approved
  } else {
    await db.execute({
      sql: `INSERT OR IGNORE INTO leave_balances (id, employee_id, year, allowed_days, used_days)
            VALUES (?, ?, ?, 28, 0)`,
      args: [nanoid(), employee_id, currentYear],
    });
  }

  const result = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [requestId],
  });

  return NextResponse.json(result.rows[0], { status: 201 });
}
