import type { InStatement } from "@libsql/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { apiHandler } from "@/lib/api-handler";

async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: { employee_ids: string[]; dates: string[]; status: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { employee_ids, dates, status, force } = body;

  if (!employee_ids?.length || !dates?.length || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validStatuses = ["present", "absent", "late", "half_day"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    // Fetch all existing records for the employee+date combinations in one query
    const placeholders = dates.map(() => "?").join(", ");
    const empPlaceholders = employee_ids.map(() => "?").join(", ");
    const existing = await db.execute({
      sql: `SELECT id, employee_id, date, is_locked FROM attendance
            WHERE employee_id IN (${empPlaceholders}) AND date IN (${placeholders})`,
      args: [...employee_ids, ...dates],
    });

    type ExistingRow = { id: string; employee_id: string; date: string; is_locked: number };
    const existingMap = new Map<string, ExistingRow>();
    for (const row of existing.rows) {
      const r = row as unknown as ExistingRow;
      existingMap.set(`${r.employee_id}|${r.date}`, r);
    }

    // Build batch statements
    const statements: InStatement[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const date of dates) {
      for (const employee_id of employee_ids) {
        const key = `${employee_id}|${date}`;
        const existing = existingMap.get(key);

        if (existing) {
          if (existing.is_locked && !force) {
            skipped++;
            continue;
          }
          statements.push({
            sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE id = ?",
            args: [status, session.user.id!, existing.id],
          });
          updated++;
        } else {
          statements.push({
            sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by) VALUES (?, ?, ?, ?, ?)",
            args: [nanoid(), employee_id, date, status, session.user.id!],
          });
          created++;
        }
      }
    }

    // Execute all in one batch
    if (statements.length > 0) {
      await db.batch(statements, "write");
    }

    return NextResponse.json({ success: true, created, updated, skipped });
  } catch (err) {
    console.error("bulk-mark error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}

export const POST = apiHandler(_POST);
