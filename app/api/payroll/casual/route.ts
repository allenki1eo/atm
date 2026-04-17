import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  const mm = String(month).padStart(2, "0");
  const yyyy = String(year);
  const datePrefix = `${yyyy}-${mm}`;

  // Get all active casual employees with company and section info
  const empResult = await db.execute({
    sql: `SELECT
            e.id, e.name, e.daily_rate, e.company_id, e.section_id,
            c.name as company_name,
            s.name as section_name
          FROM employees e
          LEFT JOIN companies c ON c.id = e.company_id
          LEFT JOIN sections s ON s.id = e.section_id
          WHERE e.type = 'casual' AND e.active = 1
          ORDER BY c.name, s.name, e.name`,
    args: [],
  });

  if (!empResult.rows.length) {
    return NextResponse.json({ employees: [], month, year });
  }

  // Count attendance per employee for this month
  const attResult = await db.execute({
    sql: `SELECT
            employee_id,
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as full_days,
            SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) as half_days
          FROM attendance
          WHERE date LIKE ?
          GROUP BY employee_id`,
    args: [`${datePrefix}%`],
  });

  type AttRow = { employee_id: string; full_days: number; half_days: number };
  const attMap = new Map<string, AttRow>();
  for (const row of attResult.rows as unknown as AttRow[]) {
    attMap.set(row.employee_id, row);
  }

  // Sum advance transactions given this month
  const advResult = await db.execute({
    sql: `SELECT employee_id, SUM(amount) as total
          FROM transactions
          WHERE type = 'advance_given' AND created_at LIKE ?
          GROUP BY employee_id`,
    args: [`${datePrefix}%`],
  });

  type AdvRow = { employee_id: string; total: number };
  const advMap = new Map<string, number>();
  for (const row of advResult.rows as unknown as AdvRow[]) {
    advMap.set(row.employee_id, row.total);
  }

  type EmpRow = {
    id: string; name: string; daily_rate: number;
    company_id: string | null; section_id: string | null;
    company_name: string | null; section_name: string | null;
  };

  const employees = (empResult.rows as unknown as EmpRow[]).map((e) => {
    const att = attMap.get(e.id);
    const full = att?.full_days ?? 0;
    const half = att?.half_days ?? 0;
    const days_worked = full + half * 0.5;
    const gross = Math.round(days_worked * (e.daily_rate ?? 0));
    const advances = advMap.get(e.id) ?? 0;
    const net = Math.max(0, gross - advances);

    return {
      employee_id: e.id,
      employee_name: e.name,
      daily_rate: e.daily_rate ?? 0,
      company_id: e.company_id ?? null,
      company_name: e.company_name ?? "Kampuni Haijawekwa",
      section_id: e.section_id ?? null,
      section_name: e.section_name ?? "Sehemu Haijawekwa",
      days_worked,
      gross_amount: gross,
      advances,
      net_amount: net,
    };
  });

  return NextResponse.json({ employees, month, year });
}
