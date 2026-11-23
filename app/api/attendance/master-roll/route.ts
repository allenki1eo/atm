import type { InStatement } from "@libsql/client";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import {
  planNssfAutofill,
  writesFromPlan,
  type ApprovedLeave,
  type ExistingAttendance,
} from "@/lib/nssf-autofill";
import {
  eachDateInclusive,
  holidayName,
  isNonWorkingDay,
  isSunday,
  monthDateRange,
} from "@/lib/tanzania-holidays";

function todayInDar(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseMonth(request: NextRequest, body?: { year?: number; month?: number }) {
  const year = Number(body?.year ?? request.nextUrl.searchParams.get("year"));
  const month = Number(body?.month ?? request.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2020 || year > 2100) {
    const today = todayInDar();
    return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  }
  return { year, month };
}

async function loadContext(year: number, month: number, companyId: string | null) {
  const { start, end } = monthDateRange(year, month);
  const companyFilter = companyId
    ? " AND (h.company_id IS NULL OR h.company_id = ?)"
    : " AND h.company_id IS NULL";
  const holidayArgs = companyId ? [start, end, companyId] : [start, end];
  const holidayRes = await db.execute({
    sql: `SELECT date, name FROM holidays h WHERE date BETWEEN ? AND ?${companyFilter}`,
    args: holidayArgs,
  });
  const extraHolidays = holidayRes.rows as unknown as { date: string; name: string }[];
  const extraDates = extraHolidays.map((h) => h.date);

  const empSql = companyId
    ? `SELECT e.id, e.name, e.deduct_nssf, e.company_id, e.section_id, e.department,
              c.name AS company_name, s.name AS section_name
       FROM employees e
       LEFT JOIN companies c ON c.id = e.company_id
       LEFT JOIN sections s ON s.id = e.section_id
       WHERE e.active = 1 AND e.company_id = ?
       ORDER BY e.name`
    : `SELECT e.id, e.name, e.deduct_nssf, e.company_id, e.section_id, e.department,
              c.name AS company_name, s.name AS section_name
       FROM employees e
       LEFT JOIN companies c ON c.id = e.company_id
       LEFT JOIN sections s ON s.id = e.section_id
       WHERE e.active = 1
       ORDER BY c.name, e.name`;
  const empRes = await db.execute({
    sql: empSql,
    args: companyId ? [companyId] : [],
  });
  type LoadedEmployee = {
    id: string;
    name: string;
    deduct_nssf: number;
    company_id: string | null;
    section_id: string | null;
    department: string | null;
    company_name: string | null;
    section_name: string | null;
  };
  const employees = empRes.rows as unknown as LoadedEmployee[];

  const ids = employees.map((e) => e.id);
  let existing: ExistingAttendance[] = [];
  let leaves: ApprovedLeave[] = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    const attRes = await db.execute({
      sql: `SELECT employee_id, date, status, is_locked FROM attendance
            WHERE employee_id IN (${placeholders}) AND date BETWEEN ? AND ?`,
      args: [...ids, start, end],
    });
    existing = (attRes.rows as unknown as { employee_id: string; date: string; status: ExistingAttendance["status"]; is_locked: number }[]).map((r) => ({
      employee_id: r.employee_id,
      date: r.date,
      status: r.status,
      is_locked: Boolean(r.is_locked),
    }));

    const leaveRes = await db.execute({
      sql: `SELECT employee_id, start_date, end_date FROM leave_requests
            WHERE status = 'approved'
              AND employee_id IN (${placeholders})
              AND start_date <= ? AND end_date >= ?`,
      args: [...ids, end, start],
    });
    leaves = leaveRes.rows as unknown as ApprovedLeave[];
  }

  const days = eachDateInclusive(start, end).map((date) => {
    const nonWorking = isNonWorkingDay(date, extraDates);
    return {
      date,
      weekday: new Date(`${date}T12:00:00+03:00`).getDay(),
      sunday: isSunday(date),
      non_working: nonWorking,
      holiday_name: nonWorking ? holidayName(date, extraHolidays) ?? (isSunday(date) ? "Jumapili" : null) : null,
    };
  });

  const companiesRes = await db.execute("SELECT id, name FROM companies ORDER BY name");

  return {
    start,
    end,
    extraHolidays,
    extraDates,
    employees: employees.map((e) => ({
      ...e,
      deduct_nssf: Boolean(e.deduct_nssf),
    })),
    existing,
    leaves,
    days,
    companies: companiesRes.rows,
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const { year, month } = parseMonth(request);
  const companyId = request.nextUrl.searchParams.get("company_id");
  const showAll = request.nextUrl.searchParams.get("show_all") === "1";
  const ctx = await loadContext(year, month, companyId);
  const visible = showAll ? ctx.employees : ctx.employees.filter((e) => e.deduct_nssf);

  const plan = planNssfAutofill({
    start: ctx.start,
    end: ctx.end,
    today: todayInDar(),
    employees: visible,
    existing: ctx.existing,
    leaves: ctx.leaves,
    extraHolidays: ctx.extraHolidays,
  });

  return NextResponse.json({
    year,
    month,
    start: ctx.start,
    end: ctx.end,
    today: todayInDar(),
    days: ctx.days,
    companies: ctx.companies,
    employees: visible,
    hidden_non_nssf: showAll ? 0 : ctx.employees.filter((e) => !e.deduct_nssf).length,
    nssf_count: ctx.employees.filter((e) => e.deduct_nssf).length,
    total_active: ctx.employees.length,
    attendance: ctx.existing,
    leaves: ctx.leaves,
    plan_summary: {
      created: plan.created,
      updated: plan.updated,
      skippedExisting: plan.skippedExisting,
      skippedLocked: plan.skippedLocked,
      skippedNonWorking: plan.skippedNonWorking,
      skippedFuture: plan.skippedFuture,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  let body: {
    year?: number;
    month?: number;
    company_id?: string | null;
    dry_run?: boolean;
    overwrite?: boolean;
    include_future?: boolean;
    show_all?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { year, month } = parseMonth(request, body);
  const companyId = body.company_id ?? request.nextUrl.searchParams.get("company_id");
  const ctx = await loadContext(year, month, companyId);
  const employees = body.show_all ? ctx.employees : ctx.employees.filter((e) => e.deduct_nssf);

  const plan = planNssfAutofill({
    start: ctx.start,
    end: ctx.end,
    today: todayInDar(),
    employees,
    existing: ctx.existing,
    leaves: ctx.leaves,
    extraHolidays: ctx.extraHolidays,
    overwrite: body.overwrite === true,
    includeFuture: body.include_future === true,
  });

  const writes = writesFromPlan(plan);
  // Default POST is a dry run unless dry_run is explicitly false.
  const apply = body.dry_run === false;

  if (!apply) {
    return NextResponse.json({
      dry_run: true,
      year,
      month,
      summary: {
        created: plan.created,
        updated: plan.updated,
        skippedExisting: plan.skippedExisting,
        skippedLocked: plan.skippedLocked,
        skippedNonWorking: plan.skippedNonWorking,
        skippedFuture: plan.skippedFuture,
      },
      writes,
    });
  }

  const statements: InStatement[] = [];
  const markedBy = session.user.id!;
  const existingMap = new Map(ctx.existing.map((r) => [`${r.employee_id}|${r.date}`, r]));

  for (const item of writes) {
    if (!item.status) continue;
    const current = existingMap.get(`${item.employee_id}|${item.date}`);
    if (current) {
      statements.push({
        sql: "UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP, notes = COALESCE(notes, ?) WHERE employee_id = ? AND date = ?",
        args: [item.status, markedBy, item.reason, item.employee_id, item.date],
      });
    } else {
      statements.push({
        // Intentionally omit check_in_at / check_out_at so autofill never invents times.
        sql: "INSERT INTO attendance (id, employee_id, date, status, marked_by, notes) VALUES (?, ?, ?, ?, ?, ?)",
        args: [nanoid(), item.employee_id, item.date, item.status, markedBy, item.reason],
      });
    }
  }

  if (statements.length > 0) {
    // libsql batch can be large; chunk to stay safe.
    const chunkSize = 200;
    for (let i = 0; i < statements.length; i += chunkSize) {
      await db.batch(statements.slice(i, i + chunkSize), "write");
    }
  }

  return NextResponse.json({
    dry_run: false,
    year,
    month,
    applied: statements.length,
    summary: {
      created: plan.created,
      updated: plan.updated,
      skippedExisting: plan.skippedExisting,
      skippedLocked: plan.skippedLocked,
      skippedNonWorking: plan.skippedNonWorking,
      skippedFuture: plan.skippedFuture,
    },
  });
}
