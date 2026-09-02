import { NextRequest, NextResponse } from "next/server";
import type { InStatement } from "@libsql/client";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { apiHandler } from "@/lib/api-handler";

type Kind = "employee" | "section";

interface HiddenRow {
  kind: Kind;
  ref_id: string;
}

/** GET — the caller's own hidden employees + sections. */
async function _GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const res = await db.execute({
    sql: "SELECT kind, ref_id FROM user_hidden_items WHERE user_id = ?",
    args: [session.user.id!],
  });

  const rows = res.rows as unknown as HiddenRow[];
  return NextResponse.json({
    employees: rows.filter((r) => r.kind === "employee").map((r) => r.ref_id),
    sections: rows.filter((r) => r.kind === "section").map((r) => r.ref_id),
  });
}

/**
 * POST — replace the caller's hidden set outright.
 * Body: { employees: string[], sections: string[] }
 *
 * A full replace (rather than per-item toggle endpoints) keeps the client
 * simple and makes the operation idempotent.
 */
async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const userId = session.user.id!;

  let body: { employees?: unknown; sections?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const asIds = (v: unknown): string[] =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && !!x))) : [];

  const employees = asIds(body.employees);
  const sections = asIds(body.sections);

  const statements: InStatement[] = [
    { sql: "DELETE FROM user_hidden_items WHERE user_id = ?", args: [userId] },
  ];
  for (const refId of employees) {
    statements.push({
      sql: "INSERT OR IGNORE INTO user_hidden_items (id, user_id, kind, ref_id) VALUES (?, ?, 'employee', ?)",
      args: [nanoid(), userId, refId],
    });
  }
  for (const refId of sections) {
    statements.push({
      sql: "INSERT OR IGNORE INTO user_hidden_items (id, user_id, kind, ref_id) VALUES (?, ?, 'section', ?)",
      args: [nanoid(), userId, refId],
    });
  }

  const CHUNK = 100;
  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK), "write");
  }

  return NextResponse.json({ employees, sections });
}

/** DELETE — unhide everything for the caller. */
async function _DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  await db.execute({
    sql: "DELETE FROM user_hidden_items WHERE user_id = ?",
    args: [session.user.id!],
  });

  return NextResponse.json({ employees: [], sections: [] });
}

export const GET = apiHandler(_GET);
export const POST = apiHandler(_POST);
export const DELETE = apiHandler(_DELETE);
