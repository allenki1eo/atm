import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

const VALID_STATUSES = ["present", "absent", "late", "half_day"] as const;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const employeeFilter = searchParams.get("employee_id");

  // Base query joins employee for display + section for supervisor scoping
  let sql = `
    SELECT
      ac.id, ac.employee_id, ac.date, ac.original_status, ac.requested_status,
      ac.reason, ac.status, ac.created_at, ac.reviewed_by, ac.reviewed_at, ac.review_note,
      e.name as employee_name, e.section_id, s.name as section_name
    FROM attendance_corrections ac
    JOIN employees e ON e.id = ac.employee_id
    LEFT JOIN sections s ON s.id = e.section_id
  `;
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (role === "employee") {
    where.push("ac.employee_id = ?");
    args.push(userId);
  } else if (role === "supervisor") {
    // Supervisor sees corrections for employees in sections they manage.
    where.push(`(
      e.supervisor_id = ?
      OR e.section_id IN (SELECT section_id FROM supervisor_sections WHERE supervisor_id = ?)
    )`);
    args.push(userId, userId);
  }
  // hr + admin see all.

  if (statusFilter) {
    where.push("ac.status = ?");
    args.push(statusFilter);
  }
  if (employeeFilter && (role === "hr" || role === "admin" || role === "supervisor")) {
    where.push("ac.employee_id = ?");
    args.push(employeeFilter);
  }

  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY ac.created_at DESC";

  const res = await db.execute({ sql, args });
  return NextResponse.json(res.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id!;
  const body = await request.json();
  const { date, requested_status, reason } = body as {
    date?: string;
    requested_status?: string;
    reason?: string;
  };

  if (!date || !requested_status || !reason?.trim()) {
    return NextResponse.json(
      { error: "date, requested_status, na reason zinahitajika" },
      { status: 400 }
    );
  }
  if (!VALID_STATUSES.includes(requested_status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "Hali si sahihi" }, { status: 400 });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json(
      { error: "Hauwezi kuomba marekebisho ya tarehe ya baadaye" },
      { status: 400 }
    );
  }

  // Resolve the employee record for this user (id == employee_id in this app)
  const empRes = await db.execute({
    sql: "SELECT id FROM employees WHERE id = ?",
    args: [userId],
  });
  if (empRes.rows.length === 0) {
    return NextResponse.json(
      { error: "Akaunti yako haijaunganishwa na mfanyakazi" },
      { status: 400 }
    );
  }

  // Don't allow corrections on dates whose attendance row is already locked
  const attRes = await db.execute({
    sql: "SELECT id, status, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
    args: [userId, date],
  });
  const existingAtt = attRes.rows[0] as unknown as
    | { id: string; status: string; is_locked: number }
    | undefined;
  if (existingAtt?.is_locked) {
    return NextResponse.json(
      { error: "Mahudhurio ya tarehe hii yamefungwa na mshahara" },
      { status: 403 }
    );
  }

  // Prevent duplicate pending requests for the same date
  const dupRes = await db.execute({
    sql: `SELECT id FROM attendance_corrections
          WHERE employee_id = ? AND date = ? AND status = 'pending'`,
    args: [userId, date],
  });
  if (dupRes.rows.length > 0) {
    return NextResponse.json(
      { error: "Tayari una ombi la marekebisho linalosubiri kwa tarehe hii" },
      { status: 400 }
    );
  }

  // Don't allow requesting the same status that's already recorded
  if (existingAtt && existingAtt.status === requested_status) {
    return NextResponse.json(
      { error: "Hali uliyoomba ni sawa na iliyopo" },
      { status: 400 }
    );
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO attendance_corrections
          (id, employee_id, date, original_attendance_id, original_status,
           requested_status, reason, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    args: [
      id,
      userId,
      date,
      existingAtt?.id ?? null,
      existingAtt?.status ?? null,
      requested_status,
      reason.trim(),
    ],
  });

  return NextResponse.json({ success: true, id });
}
