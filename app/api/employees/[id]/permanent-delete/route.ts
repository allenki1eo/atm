import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
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

  const tables = [
    "attendance",
    "leave_requests",
    "transactions",
    "employee_status_events",
    "employee_transfer_history",
    "overtime_records",
  ];

  for (const table of tables) {
    await db.execute({ sql: `DELETE FROM ${table} WHERE employee_id = ?`, args: [id] });
  }
  await db.execute({ sql: "DELETE FROM employees WHERE id = ?", args: [id] });

  return NextResponse.json({ success: true });
}
