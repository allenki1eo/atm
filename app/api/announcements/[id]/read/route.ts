import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const { id } = await params;
  await db.execute({
    sql: `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id)
          VALUES (?, ?)`,
    args: [id, session.user.id!],
  });
  return NextResponse.json({ ok: true });
}
