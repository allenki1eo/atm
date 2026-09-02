import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden: HR or admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { date } = body;

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const result = await db.execute({
    sql: "UPDATE attendance SET is_locked = 0 WHERE date = ? AND is_locked = 1",
    args: [date],
  });

  const unlocked_count = result.rowsAffected ?? 0;

  return NextResponse.json({ unlocked_count });
}

export const POST = apiHandler(_POST);
