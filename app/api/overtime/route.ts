import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  let sql = `SELECT oe.*, e.name as employee_name, e.type as employee_type
             FROM overtime_entries oe
             JOIN employees e ON e.id = oe.employee_id
             WHERE 1=1`;
  const args: (string | number)[] = [];

  if (employeeId) { sql += " AND oe.employee_id = ?"; args.push(employeeId); }
  if (month && year) {
    const y = parseInt(year), m = parseInt(month);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = new Date(y, m, 0).toISOString().split("T")[0];
    sql += " AND oe.date >= ? AND oe.date <= ?";
    args.push(start, end);
  }
  sql += " ORDER BY oe.date DESC";

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin" && role !== "supervisor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { employee_id, date, hours, notes } = body as {
    employee_id?: string;
    date?: string;
    hours?: number;
    notes?: string;
  };

  if (!employee_id || !date || !hours) {
    return NextResponse.json({ error: "employee_id, date, and hours required" }, { status: 400 });
  }

  const empResult = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [employee_id],
  });
  if (!empResult.rows.length) {
    return NextResponse.json({ error: "Mfanyakazi hajapatikana" }, { status: 404 });
  }

  const emp = empResult.rows[0] as unknown as {
    type: string;
    daily_rate: number;
    monthly_salary: number;
    overtime_rule: string;
  };

  if (emp.overtime_rule === "none") {
    return NextResponse.json({ error: "Mfanyakazi huyu hana ruhusa ya overtime" }, { status: 400 });
  }

  // Casual: each 9 hours = 1 daily_rate; Fulltime: (monthly_salary / 28 / 9) * hours
  let amount: number;
  if (emp.type === "casual") {
    amount = Math.round(Math.floor(hours / 9) * emp.daily_rate);
  } else {
    amount = Math.round((emp.monthly_salary / 28 / 9) * hours);
  }

  if (amount <= 0) {
    return NextResponse.json({ error: "Saa za overtime hazitoshi kukokotoa malipo" }, { status: 400 });
  }

  const id = nanoid();
  try {
    await db.execute({
      sql: "INSERT INTO overtime_entries (id, employee_id, date, hours, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, employee_id, date, hours, amount, notes ?? null, session.user.id!],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ id, employee_id, date, hours, amount }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.execute({ sql: "DELETE FROM overtime_entries WHERE id = ?", args: [id] });
  return NextResponse.json({ success: true });
}
