import { NextRequest, NextResponse } from "next/server";
import type { InStatement } from "@libsql/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing employee id" }, { status: 400 });

  const existing = await db.execute({ sql: "SELECT id FROM employees WHERE id = ?", args: [id] });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Every table carrying an employee_id FK. Children first, then the employee
  // row itself. NOTE: this list previously said "overtime_records", a table
  // that does not exist — which made every permanent delete fail.
  const tables = [
    "attendance",
    "attendance_corrections",
    "leave_requests",
    "leave_balances",
    "transactions",
    "advance_requests",
    "advance_schedules",
    "complaints",
    "payslips",
    "service_certificates",
    "overtime_entries",
    "employee_status_events",
    "employee_transfer_history",
    "users",
  ];

  const statements: InStatement[] = tables.map((table) => ({
    sql: `DELETE FROM ${table} WHERE employee_id = ?`,
    args: [id],
  }));
  statements.push({ sql: "DELETE FROM employees WHERE id = ?", args: [id] });

  // One atomic transaction — a partial delete would leave orphaned rows.
  await db.batch(statements, "write");

  return NextResponse.json({ success: true });
}

export const DELETE = apiHandler(_DELETE);
