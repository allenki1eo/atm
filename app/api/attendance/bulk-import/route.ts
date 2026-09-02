import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { apiHandler } from "@/lib/api-handler";

const STATUS_MAP: Record<string, string> = {
  p: "present",
  a: "absent",
  l: "late",
  h: "half_day",
};

function detectSeparator(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

// Convert M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD; pass through YYYY-MM-DD unchanged
function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

// Normalize phone to +255... format, handling:
// - scientific notation (Excel: 2.557E+11)
// - bare digits without +
// - already correct +255... format
function parsePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");

  if (trimmed.startsWith("+")) return trimmed;

  // Scientific notation (Excel: 2.557E+11)
  const sci = trimmed.match(/^([\d.]+)[eE]([+-]?\d+)$/);
  if (sci) {
    const full = Math.round(parseFloat(sci[1]) * Math.pow(10, parseInt(sci[2], 10))).toString();
    if (full.startsWith("255") && full.length >= 12) return `+${full}`;
    if (full.startsWith("0") && full.length >= 10) return `+255${full.substring(1)}`;
    return full.length >= 9 ? `+${full}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("255") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+255${digits.substring(1)}`;
  return digits.length >= 9 ? digits : null;
}

// Look up employee by phone, trying exact, with +, and without +
async function findEmployeeByPhone(phone: string) {
  const cleaned = phone.replace(/^\+/, "");
  const result = await db.execute({
    sql: "SELECT id, name FROM employees WHERE phone = ? OR phone = ? OR phone = ?",
    args: [phone, "+" + cleaned, cleaned],
  });
  return result.rows[0] as unknown as { id: string; name: string } | undefined;
}

async function _POST(request: NextRequest) {
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

  const sep = detectSeparator(lines[0]);
  const headerCols = lines[0].split(sep).map((h) => h.trim());

  if (headerCols[0].toLowerCase() !== "phone") {
    return NextResponse.json(
      { error: "First column of CSV header must be 'phone'" },
      { status: 400 }
    );
  }

  // Normalize all date headers from M/D/YYYY → YYYY-MM-DD
  const dateCols = headerCols.slice(1).map(normalizeDate);
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
    const cols = lines[i].split(sep).map((c) => c.trim());
    const rawPhone = cols[0];

    if (!rawPhone) continue;

    const phone = parsePhoneNumber(rawPhone);

    if (!phone) {
      results.push({ phone: rawPhone, name: null, dates_processed: 0, dates_skipped: 0 });
      continue;
    }

    const emp = await findEmployeeByPhone(phone);

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

export const POST = apiHandler(_POST);
