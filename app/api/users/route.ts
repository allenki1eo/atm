import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.execute(
    "SELECT id, name, role, email FROM users ORDER BY name"
  );
  return NextResponse.json(result.rows);
}
