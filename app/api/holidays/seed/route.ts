import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { tanzaniaHolidaysForYear } from "@/lib/tanzania-holidays";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  let body: { from_year?: number; to_year?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const thisYear = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dar_es_Salaam",
      year: "numeric",
    }).format(new Date())
  );
  const fromYear = body.from_year ?? 2025;
  const toYear = body.to_year ?? thisYear + 1;
  if (fromYear > toYear || toYear - fromYear > 10) {
    return NextResponse.json({ error: "Invalid year range" }, { status: 400 });
  }

  const existing = await db.execute(
    "SELECT date FROM holidays WHERE company_id IS NULL"
  );
  const have = new Set((existing.rows as unknown as { date: string }[]).map((r) => r.date));

  let inserted = 0;
  let skipped = 0;
  const added: { date: string; name: string; official: boolean }[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    for (const holiday of tanzaniaHolidaysForYear(year)) {
      if (have.has(holiday.date)) {
        skipped++;
        continue;
      }
      await db.execute({
        sql: "INSERT INTO holidays (id, date, name, company_id) VALUES (?, ?, ?, NULL)",
        args: [nanoid(), holiday.date, holiday.name],
      });
      have.add(holiday.date);
      inserted++;
      added.push(holiday);
    }
  }

  return NextResponse.json({ inserted, skipped, added, from_year: fromYear, to_year: toYear });
}
