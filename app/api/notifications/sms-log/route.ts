import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 100), 500);

  const result = await db.execute({
    sql: `SELECT l.*, u.name AS sender_name
          FROM sms_log l LEFT JOIN users u ON u.id = l.sent_by
          ORDER BY l.created_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return NextResponse.json(result.rows);
}
