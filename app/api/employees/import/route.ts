import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { sendSMS } from "@/lib/at";

const FOOD_ADVANCE_AMOUNTS = new Set([0, 20000, 25000, 30000, 35000]);

function normalizeFoodAdvance(value: unknown) {
  const amount = Math.round(Number(value ?? 0));
  return FOOD_ADVANCE_AMOUNTS.has(amount) ? amount : 0;
}

interface ImportResult {
  row: number;
  name: string;
  phone: string;
  status: "success" | "error";
  error?: string;
  smsSent?: boolean;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = values[i] ?? "";
    });
    return record;
  });
}

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Only admins can import employees" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
  }

  const csvText = await (file as File).text();
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV is empty or has no valid rows" }, { status: 400 });
  }

  const results: ImportResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // 1-indexed, accounting for header

    const name = raw["name"]?.trim();
    const phone = raw["phone"]?.trim();
    const type = raw["type"]?.trim().toLowerCase() as "casual" | "fulltime";
    const department = raw["department"]?.trim() || undefined;
    const supervisorId = raw["supervisor_id"]?.trim() || undefined;

    // Validate required fields
    if (!name) {
      results.push({ row: rowNum, name: "(missing)", phone: phone ?? "", status: "error", error: "Name required" });
      continue;
    }
    if (!phone) {
      results.push({ row: rowNum, name, phone: "", status: "error", error: "Phone required" });
      continue;
    }
    if (type !== "casual" && type !== "fulltime") {
      results.push({ row: rowNum, name, phone, status: "error", error: `Invalid type: "${raw["type"]}" (must be casual or fulltime)` });
      continue;
    }

    const dailyRate = type === "casual" ? Math.round(Number(raw["daily_rate"]) || 0) : 0;
    const monthlySalary = type === "fulltime" ? Math.round(Number(raw["monthly_salary"]) || 0) : 0;
    const foodAdvanceAmount = normalizeFoodAdvance(raw["food_advance_amount"]);
    const overtimeRule = (["all_days", "holidays_only", "none"].includes(raw["overtime_rule"] ?? "")
      ? raw["overtime_rule"]
      : "none") as "all_days" | "holidays_only" | "none";

    // Check for existing phone in employees or users
    const existing = await db.execute({
      sql: "SELECT id FROM employees WHERE phone = ?",
      args: [phone],
    });
    if (existing.rows.length > 0) {
      results.push({ row: rowNum, name, phone, status: "error", error: "Phone already registered" });
      continue;
    }

    const existingUser = await db.execute({
      sql: "SELECT id FROM users WHERE phone = ?",
      args: [phone],
    });
    if (existingUser.rows.length > 0) {
      results.push({ row: rowNum, name, phone, status: "error", error: "Phone already has a user account" });
      continue;
    }

    const employeeId = nanoid();
    const userId = nanoid();
    const pin = generatePIN();
    let passwordHash: string;

    try {
      passwordHash = await bcrypt.hash(pin, 10);
    } catch {
      results.push({ row: rowNum, name, phone, status: "error", error: "Failed to hash password" });
      continue;
    }

    try {
      // Insert employee record
      await db.execute({
        sql: `INSERT INTO employees (id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, food_advance_amount, overtime_rule)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [employeeId, name, phone, type, department ?? null, supervisorId ?? null, dailyRate, monthlySalary, foodAdvanceAmount, overtimeRule],
      });

      // Insert user record with employee role
      await db.execute({
        sql: `INSERT INTO users (id, name, role, phone, password_hash, employee_id)
              VALUES (?, ?, 'employee', ?, ?, ?)`,
        args: [userId, name, phone, passwordHash, employeeId],
      });
      await db.execute({
        sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
              VALUES (?, ?, 'created', NULL, 1, ?, ?)`,
        args: [nanoid(), employeeId, "Employee record created by CSV import", session.user.id ?? null],
      });
    } catch (err) {
      // Rollback employee if user insert failed
      await db.execute({ sql: "DELETE FROM employees WHERE id = ?", args: [employeeId] }).catch(() => {});
      await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] }).catch(() => {});
      results.push({
        row: rowNum, name, phone, status: "error",
        error: err instanceof Error ? err.message : "Database error",
      });
      continue;
    }

    // Send SMS with login credentials
    const message =
      `Karibu TrustTrack! Jina: ${name}. ` +
      `Ingia kwa nambari yako: ${phone}. ` +
      `PIN: ${pin}. Usishiriki PIN hii. ` +
      `Ingia hapa: https://atwork.eastafricanspirit.co.tz/login`;

    const smsResult = await sendSMS(phone, message, {
      sentBy: session.user.id ?? null,
      source: "employee_import",
    });

    results.push({
      row: rowNum,
      name,
      phone,
      status: "success",
      smsSent: smsResult.success,
    });
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  const smsSent = results.filter((r) => r.smsSent).length;

  return NextResponse.json({ results, summary: { total: rows.length, succeeded, failed, smsSent } });
}
