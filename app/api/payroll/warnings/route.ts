import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

type WarningSeverity = "high" | "medium" | "low";

interface PayrollWarning {
  id: string;
  type: string;
  severity: WarningSeverity;
  title: string;
  description: string;
  employee_id?: string | null;
  employee_name?: string | null;
  date?: string | null;
}

const isValidPeriod = (month: number, year: number) =>
  Number.isInteger(month) &&
  month >= 1 &&
  month <= 12 &&
  Number.isInteger(year) &&
  year >= 2000 &&
  year <= 2100;

async function _GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") ?? "");
  const year = parseInt(searchParams.get("year") ?? "");
  const companyId = searchParams.get("company_id");

  if (!isValidPeriod(month, year)) {
    return NextResponse.json({ error: "Valid month and year required" }, { status: 400 });
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];
  const employeeScope = companyId ? "AND e.company_id = ?" : "";
  const scopeArgs = companyId ? [companyId] : [];
  const warnings: PayrollWarning[] = [];

  const pendingCorrections = await db.execute({
    sql: `SELECT ac.id, ac.employee_id, ac.date, ac.requested_status, e.name as employee_name
          FROM attendance_corrections ac
          JOIN employees e ON e.id = ac.employee_id
          WHERE ac.status = 'pending'
            AND ac.date >= ? AND ac.date <= ?
            ${employeeScope}
          ORDER BY ac.date ASC, e.name ASC`,
    args: [startDate, endDate, ...scopeArgs],
  });

  for (const row of pendingCorrections.rows as unknown as {
    id: string; employee_id: string; date: string; requested_status: string; employee_name: string;
  }[]) {
    warnings.push({
      id: `correction-${row.id}`,
      type: "pending_correction",
      severity: "high",
      title: "Pending attendance correction",
      description: `${row.employee_name} has a pending correction for ${row.date} (${row.requested_status}).`,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      date: row.date,
    });
  }

  const missingAttendance = await db.execute({
    sql: `SELECT e.id, e.name, e.type
          FROM employees e
          WHERE e.active = 1
            AND NOT EXISTS (
              SELECT 1 FROM users u
              WHERE u.employee_id = e.id AND u.role IN ('admin','hr')
            )
            ${employeeScope}
            AND NOT EXISTS (
              SELECT 1 FROM attendance a
              WHERE a.employee_id = e.id
                AND a.date >= ? AND a.date <= ?
            )
          ORDER BY e.name ASC
          LIMIT 100`,
    args: [...scopeArgs, startDate, endDate],
  });

  for (const row of missingAttendance.rows as unknown as { id: string; name: string; type: string }[]) {
    warnings.push({
      id: `missing-attendance-${row.id}`,
      type: "missing_attendance",
      severity: "medium",
      title: "No attendance for the period",
      description: `${row.name} (${row.type === "casual" ? "Mkataba" : "Kudumu"}) has no attendance records this month.`,
      employee_id: row.id,
      employee_name: row.name,
    });
  }

  const overtimeConflicts = await db.execute({
    sql: `SELECT oe.id, oe.employee_id, oe.date, oe.hours, e.name as employee_name, a.status as attendance_status
          FROM overtime_entries oe
          JOIN employees e ON e.id = oe.employee_id
          LEFT JOIN attendance a ON a.employee_id = oe.employee_id AND a.date = oe.date
          WHERE oe.date >= ? AND oe.date <= ?
            ${employeeScope}
            AND (a.id IS NULL OR a.status = 'absent')
          ORDER BY oe.date ASC, e.name ASC`,
    args: [startDate, endDate, ...scopeArgs],
  });

  for (const row of overtimeConflicts.rows as unknown as {
    id: string; employee_id: string; date: string; hours: number; employee_name: string; attendance_status: string | null;
  }[]) {
    warnings.push({
      id: `overtime-conflict-${row.id}`,
      type: "overtime_attendance_conflict",
      severity: "high",
      title: "Overtime without matching attendance",
      description: `${row.employee_name} has ${row.hours} overtime hours on ${row.date}, but attendance is ${row.attendance_status ?? "missing"}.`,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      date: row.date,
    });
  }

  const duplicateOvertime = await db.execute({
    sql: `SELECT oe.employee_id, oe.date, COUNT(*) as count, SUM(oe.hours) as hours, e.name as employee_name
          FROM overtime_entries oe
          JOIN employees e ON e.id = oe.employee_id
          WHERE oe.date >= ? AND oe.date <= ?
            ${employeeScope}
          GROUP BY oe.employee_id, oe.date
          HAVING COUNT(*) > 1
          ORDER BY oe.date ASC, e.name ASC`,
    args: [startDate, endDate, ...scopeArgs],
  });

  for (const row of duplicateOvertime.rows as unknown as {
    employee_id: string; date: string; count: number; hours: number; employee_name: string;
  }[]) {
    warnings.push({
      id: `duplicate-overtime-${row.employee_id}-${row.date}`,
      type: "duplicate_overtime",
      severity: "medium",
      title: "Multiple overtime entries on one date",
      description: `${row.employee_name} has ${row.count} overtime records on ${row.date} totaling ${row.hours} hours.`,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      date: row.date,
    });
  }

  const invalidEmployeeSetup = await db.execute({
    sql: `SELECT e.id, e.name, e.type, e.daily_rate, e.monthly_salary, e.company_id, e.section_id
          FROM employees e
          WHERE e.active = 1
            ${employeeScope}
            AND (
              (e.type = 'casual' AND COALESCE(e.daily_rate, 0) <= 0)
              OR (e.type = 'fulltime' AND COALESCE(e.monthly_salary, 0) <= 0)
              OR e.company_id IS NULL
              OR e.section_id IS NULL
            )
          ORDER BY e.name ASC
          LIMIT 100`,
    args: scopeArgs,
  });

  for (const row of invalidEmployeeSetup.rows as unknown as {
    id: string; name: string; type: string; daily_rate: number; monthly_salary: number;
    company_id: string | null; section_id: string | null;
  }[]) {
    const missing = [
      row.type === "casual" && (row.daily_rate ?? 0) <= 0 ? "daily rate" : null,
      row.type === "fulltime" && (row.monthly_salary ?? 0) <= 0 ? "monthly salary" : null,
      !row.company_id ? "company" : null,
      !row.section_id ? "section" : null,
    ].filter(Boolean).join(", ");

    warnings.push({
      id: `employee-setup-${row.id}`,
      type: "employee_setup",
      severity: missing.includes("rate") || missing.includes("salary") ? "high" : "low",
      title: "Employee setup needs attention",
      description: `${row.name} is missing: ${missing}.`,
      employee_id: row.id,
      employee_name: row.name,
    });
  }

  const summary = warnings.reduce(
    (acc, warning) => {
      acc[warning.severity] += 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 }
  );

  return NextResponse.json({
    month,
    year,
    company_id: companyId ?? null,
    start_date: startDate,
    end_date: endDate,
    summary,
    warnings,
  });
}

export const GET = apiHandler(_GET);
