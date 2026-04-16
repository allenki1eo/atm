import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

const STATUS_MAP: Record<string, string> = {
  p: "present",
  a: "absent",
  l: "late",
  h: "half_day",
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "CSV file is required (field name: file)" }, { status: 400 });
  }

  const csvText = await file.text();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
  }

  const headerCols = lines[0].split(",").map((h) => h.trim());
  if (headerCols[0].toLowerCase() !== "phone") {
    return NextResponse.json(
      { error: "First column of CSV header must be 'phone'" },
      { status: 400 }
    );
  }

  const dateCols = headerCols.slice(1);
  const today = new Date().toISOString().substring(0, 10);
  const markedBy = session.user.id!;

  let totalRecordsWritten = 0;
  let skippedLocked = 0;

  const results: {
    phone: string;
    name: string | null;
    dates_processed: number;
    dates_skipped: number;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const phone = cols[0];

    if (!phone) continue;

    // Look up employee by phone
    const empResult = await db.execute({
      sql: "SELECT id, name FROM employees WHERE phone = ?",
      args: [phone],
    });

    const emp = empResult.rows[0] as unknown as { id: string; name: string } | undefined;

    if (!emp) {
      results.push({ phone, name: null, dates_processed: 0, dates_skipped: 0 });
      continue;
    }

    let datesProcessed = 0;
    let datesSkipped = 0;

    for (let d = 0; d < dateCols.length; d++) {
      const dateStr = dateCols[d];
      const rawValue = (cols[d + 1] ?? "").trim().toLowerCase();

      if (!rawValue) continue;

      const mappedStatus = STATUS_MAP[rawValue];
      if (!mappedStatus) continue;

      // Skip future dates
      if (dateStr > today) {
        datesSkipped++;
        continue;
      }

      // Check if record is locked
      const existingResult = await db.execute({
        sql: "SELECT id, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
        args: [emp.id, dateStr],
      });

      const existing = existingResult.rows[0] as unknown as {
        id: string;
        is_locked: number;
      } | undefined;

      if (existing) {
        if (existing.is_locked) {
          datesSkipped++;
          skippedLocked++;
          continue;
        }

        await db.execute({
          sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE id = ?",
          args: [mappedStatus, markedBy, existing.id],
        });
      } else {
        await db.execute({
          sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by) VALUES (?, ?, ?, ?, ?)",
          args: [nanoid(), emp.id, dateStr, mappedStatus, markedBy],
        });
      }

      datesProcessed++;
      totalRecordsWritten++;
    }

    results.push({
      phone,
      name: emp.name,
      dates_processed: datesProcessed,
      dates_skipped: datesSkipped,
    });
  }

  return NextResponse.json({
    results,
    summary: {
      total_employees: results.length,
      total_records_written: totalRecordsWritten,
      skipped_locked: skippedLocked,
    },
  });
}
