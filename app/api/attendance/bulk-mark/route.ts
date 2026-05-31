import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { employee_ids, dates, status, force } = body as {
    employee_ids: string[];
    dates: string[];
    status: string;
    force?: boolean;
  };

  if (!employee_ids?.length || !dates?.length || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validStatuses = ["present", "absent", "late", "half_day"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const date of dates) {
    for (const employee_id of employee_ids) {
      const existing = await db.execute({
        sql: "SELECT id, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
        args: [employee_id, date],
      });

      if (existing.rows.length > 0) {
        const row = existing.rows[0] as unknown as { id: string; is_locked: number };
        if (row.is_locked && !force) {
          skipped++;
          continue;
        }
        await db.execute({
          sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE id = ?",
          args: [status, session.user.id!, row.id],
        });
        updated++;
      } else {
        await db.execute({
          sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by) VALUES (?, ?, ?, ?, ?)",
          args: [nanoid(), employee_id, date, status, session.user.id!],
        });
        created++;
      }
    }
  }

  return NextResponse.json({ success: true, created, updated, skipped });
}
