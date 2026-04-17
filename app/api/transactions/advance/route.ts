import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  const role = (session.user as { role: string }).role;

  let sql: string;
  let args: (string | number)[];

  if (employeeId) {
    sql = `SELECT t.*, e.name as employee_name
           FROM transactions t
           JOIN employees e ON e.id = t.employee_id
           WHERE t.employee_id = ?
           ORDER BY t.created_at DESC`;
    args = [employeeId];
  } else if (role === "hr" || role === "admin") {
    sql = `SELECT t.*, e.name as employee_name
           FROM transactions t
           JOIN employees e ON e.id = t.employee_id
           ORDER BY t.created_at DESC
           LIMIT 100`;
    args = [];
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.execute({ sql, args });

  // Calculate balance
  const balance = (result.rows as unknown as { amount: number; type: string }[]).reduce((acc, t) => {
    return acc + t.amount;
  }, 0);

  return NextResponse.json({ transactions: result.rows, balance });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Only HR/Admin can approve advances" }, { status: 403 });
  }

  const body = await request.json();
  const { employee_id, type, amount, description } = body;

  if (!employee_id || !type || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validTypes = ["advance_given", "advance_deducted", "salary_paid"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
  }

  const id = nanoid();
  // advance_given is negative (company owes less / employee owes company)
  const adjustedAmount = type === "advance_given" ? -Math.abs(amount) : Math.abs(amount);

  await db.execute({
    sql: `INSERT INTO transactions (id, employee_id, type, amount, description, created_by)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, employee_id, type, adjustedAmount, description ?? null, session.user.id!],
  });

  // Send SMS
  const empResult = await db.execute({
    sql: "SELECT name, phone FROM employees WHERE id = ?",
    args: [employee_id],
  });

  const emp = empResult.rows[0] as unknown as { name: string; phone: string };

  if (type === "advance_given" && emp?.phone) {
    // Get new balance
    const balResult = await db.execute({
      sql: "SELECT SUM(amount) as total FROM transactions WHERE employee_id = ?",
      args: [employee_id],
    });
    const newBalance = (balResult.rows[0] as unknown as { total: number }).total ?? 0;

    const message = smsTemplates.advanceApproved(
      formatCurrency(Math.abs(amount)),
      formatCurrency(newBalance)
    );
    sendSMS(emp.phone, message, {
      sentBy: session.user.id ?? null,
      source: "advance_approved",
    }).catch(console.error);
  }

  return NextResponse.json({ success: true, id, amount: adjustedAmount });
}
