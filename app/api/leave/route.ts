import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { calcWorkingDays } from "@/lib/utils";
import { sendSMS } from "@/lib/at";

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
      carryover_days: number | null;
    } | undefined;

    // If no balance row yet, use per-employee allowance from employees table
    let fallbackAllowance = 28;
    if (!balance) {
      const emp = await db.execute({
        sql: "SELECT leave_allowance_days FROM employees WHERE id = ?",
        args: [employeeId],
      });
      const empRow = emp.rows[0] as unknown as {
        leave_allowance_days: number | null;
      } | undefined;
      fallbackAllowance = empRow?.leave_allowance_days ?? 28;
    }

    return NextResponse.json({
      requests: requestsResult.rows,
      balance: balance ?? {
        employee_id: employeeId,
        year: currentYear,
        allowed_days: fallbackAllowance,
        used_days: 0,
        carryover_days: 0,
      },
    });
  } else if (role === "supervisor") {
    requestsSql = `
      SELECT lr.*, e.name as employee_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.supervisor_id = ?
        OR e.section_id IN (
          SELECT section_id FROM supervisor_sections WHERE supervisor_id = ?
        )
      ORDER BY lr.submitted_at DESC
    `;
    const result = await db.execute({ sql: requestsSql, args: [userId, userId] });
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

  // Calculate days (inclusive, excluding weekends + holidays)
  const startMs = new Date(start_date).getTime();
  const endMs = new Date(end_date).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  if (endMs < startMs) {
    return NextResponse.json({ error: "end_date must be on or after start_date" }, { status: 400 });
  }

  const currentYear = new Date(start_date).getFullYear();

  // Load employee's company for scoped holidays + per-employee allowance
  const empInfo = await db.execute({
    sql: "SELECT company_id, leave_allowance_days FROM employees WHERE id = ?",
    args: [employee_id],
  });
  const empInfoRow = empInfo.rows[0] as unknown as {
    company_id: string | null;
    leave_allowance_days: number | null;
  } | undefined;
  const companyId = empInfoRow?.company_id ?? null;
  const perEmployeeAllowance = empInfoRow?.leave_allowance_days ?? 28;

  // Pull holidays that apply (global + company-scoped) between start and end
  const holidayRows = await db.execute({
    sql: companyId
      ? `SELECT date FROM holidays WHERE date BETWEEN ? AND ? AND (company_id IS NULL OR company_id = ?)`
      : `SELECT date FROM holidays WHERE date BETWEEN ? AND ? AND company_id IS NULL`,
    args: companyId ? [start_date, end_date, companyId] : [start_date, end_date],
  });
  const holidayDates = (holidayRows.rows as unknown as { date: string }[]).map(
    (r) => r.date
  );

  const days = calcWorkingDays(start_date, end_date, holidayDates);
  if (days <= 0) {
    return NextResponse.json(
      { error: "Likizo haihesabiki — tarehe ni za wikendi au sikukuu." },
      { status: 400 }
    );
  }

  // Check balance — carryover from previous year adds to this year's allowance
  const balanceResult = await db.execute({
    sql: "SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?",
    args: [employee_id, currentYear],
  });

  const balance = balanceResult.rows[0] as unknown as {
    id: string;
    allowed_days: number;
    used_days: number;
    carryover_days: number | null;
  } | undefined;

  let carryover = balance?.carryover_days ?? 0;
  if (!balance) {
    // First time this year — compute carryover from previous year's unused
    const prev = await db.execute({
      sql: "SELECT allowed_days, used_days, carryover_days FROM leave_balances WHERE employee_id = ? AND year = ?",
      args: [employee_id, currentYear - 1],
    });
    const prevRow = prev.rows[0] as unknown as {
      allowed_days: number;
      used_days: number;
      carryover_days: number | null;
    } | undefined;
    if (prevRow) {
      const prevAllowed = prevRow.allowed_days + (prevRow.carryover_days ?? 0);
      // Cap carryover at half the annual allowance so it can't accrue forever
      carryover = Math.max(
        0,
        Math.min(
          Math.floor(perEmployeeAllowance / 2),
          prevAllowed - prevRow.used_days
        )
      );
    }
  }

  const allowedDays = balance?.allowed_days ?? perEmployeeAllowance;
  const usedDays = balance?.used_days ?? 0;
  const remaining = allowedDays + carryover - usedDays;

  if (days > remaining) {
    return NextResponse.json(
      {
        error: `Insufficient leave balance. Requested ${days} working days but only ${remaining} days remaining.`,
      },
      { status: 400 }
    );
  }

  const requestId = nanoid();

  await db.execute({
    sql: `INSERT INTO leave_requests (id, employee_id, start_date, end_date, days, reason, leave_type, employee_phone, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_supervisor')`,
    args: [requestId, employee_id, start_date, end_date, days, reason ?? null, leave_type ?? null, employee_phone ?? null],
  });

  const supervisorRows = await db.execute({
    sql: `SELECT DISTINCT u.phone, u.id, e.name as employee_name
          FROM employees e
          JOIN users u ON (
            u.id = e.supervisor_id
            OR u.id IN (
              SELECT ss.supervisor_id
              FROM supervisor_sections ss
              WHERE ss.section_id = e.section_id
            )
          )
          WHERE e.id = ?
            AND u.phone IS NOT NULL
            AND u.phone != ''`,
    args: [employee_id],
  });
  await Promise.all(
    (supervisorRows.rows as unknown as {
      phone: string;
      id: string;
      employee_name: string;
    }[]).map((row) =>
      sendSMS(
        row.phone,
        `TrustTrack: ${row.employee_name} ameomba likizo ya siku ${days} (${start_date} - ${end_date}). Tafadhali pitia kwenye mfumo.`,
        {
          sentBy: userId,
          source: "leave_supervisor_review",
        }
      ).catch(console.error)
    )
  );

  // Upsert leave_balances for the year with per-employee allowance + carryover
  if (!balance) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO leave_balances (id, employee_id, year, allowed_days, used_days, carryover_days)
            VALUES (?, ?, ?, ?, 0, ?)`,
      args: [nanoid(), employee_id, currentYear, perEmployeeAllowance, carryover],
    });
  }

  const result = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [requestId],
  });

  return NextResponse.json(result.rows[0], { status: 201 });
}
