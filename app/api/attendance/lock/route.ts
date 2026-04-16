import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { date } = body;

  if (!date) return NextResponse.json({ error: "Date required" }, { status: 400 });

  await db.execute({
    sql: "UPDATE attendance SET is_locked = 1 WHERE date = ? AND marked_by = ?",
    args: [date, session.user.id!],
  });

  const result = await db.execute({
    sql: "SELECT COUNT(*) as locked FROM attendance WHERE date = ? AND is_locked = 1",
    args: [date],
  });

  return NextResponse.json({
    success: true,
    date,
    locked: (result.rows[0] as unknown as { locked: number }).locked,
  });
}
