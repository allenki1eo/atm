import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { flattenNssfLists, type NssfListPerson } from "@/lib/nssf-lists";
import { planNssfImport, type ImportEmployee } from "@/lib/nssf-import";

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function loadEmployeesAndCompanies() {
  const companies = await db.execute("SELECT id, name FROM companies ORDER BY name");
  const employees = await db.execute(`
    SELECT e.id, e.name, e.company_id, e.deduct_nssf, e.active, c.name AS company_name
    FROM employees e
    LEFT JOIN companies c ON c.id = e.company_id
    ORDER BY e.name
  `);
  return {
    companies: companies.rows as unknown as { id: string; name: string }[],
    employees: employees.rows as unknown as ImportEmployee[],
  };
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const { companies, employees } = await loadEmployeesAndCompanies();
  const plan = planNssfImport(flattenNssfLists(), companies, employees);
  return NextResponse.json({
    dry_run: true,
    source: "builtin_pdf_lists",
    totals: {
      listed: plan.rows.length,
      set_nssf: plan.setNssf.length,
      already_nssf: plan.alreadyNssf.length,
      to_create: plan.toCreate.length,
      unassigned: plan.unassigned.length,
      fuzzy_review: plan.fuzzyReview.length,
      ambiguous: plan.ambiguous.length,
      other_company: plan.otherCompany.length,
      company_missing: plan.companyMissing.length,
    },
    set_nssf: plan.setNssf,
    already_nssf: plan.alreadyNssf,
    unassigned: plan.unassigned,
    fuzzy_review: plan.fuzzyReview,
    to_create: plan.toCreate,
    ambiguous: plan.ambiguous,
    other_company: plan.otherCompany,
    company_missing: plan.companyMissing,
    companies,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await ensureDatabase();
  let body: { apply?: boolean; people?: NssfListPerson[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const people = body.people?.length ? body.people : flattenNssfLists();
  const { companies, employees } = await loadEmployeesAndCompanies();
  const plan = planNssfImport(people, companies, employees);

  const totals = {
    listed: plan.rows.length,
    set_nssf: plan.setNssf.length,
    already_nssf: plan.alreadyNssf.length,
    to_create: plan.toCreate.length,
    unassigned: plan.unassigned.length,
    fuzzy_review: plan.fuzzyReview.length,
    ambiguous: plan.ambiguous.length,
    other_company: plan.otherCompany.length,
    company_missing: plan.companyMissing.length,
  };

  if (body.apply !== true) {
    return NextResponse.json({
      dry_run: true,
      totals,
      set_nssf: plan.setNssf,
      already_nssf: plan.alreadyNssf,
    unassigned: plan.unassigned,
    fuzzy_review: plan.fuzzyReview,
      to_create: plan.toCreate,
      ambiguous: plan.ambiguous,
      other_company: plan.otherCompany,
      company_missing: plan.companyMissing,
    });
  }

  let flagged = 0;
  let assigned = 0;
  for (const row of plan.setNssf) {
    if (!row.employee_id) continue;
    await db.execute({
      sql: "UPDATE employees SET deduct_nssf = 1 WHERE id = ?",
      args: [row.employee_id],
    });
    flagged++;
  }
  for (const row of plan.unassigned) {
    if (!row.employee_id || !row.company_id) continue;
    await db.execute({
      sql: "UPDATE employees SET deduct_nssf = 1, company_id = ? WHERE id = ?",
      args: [row.company_id, row.employee_id],
    });
    flagged++;
    assigned++;
  }

  const created: { name: string; company_name?: string; phone: string }[] = [];
  let createIndex = 1;
  const existingTemps = await db.execute(
    "SELECT phone FROM employees WHERE phone LIKE 'TEMP-NSSF-%'"
  );
  const usedPhones = new Set(
    (existingTemps.rows as unknown as { phone: string }[]).map((r) => r.phone)
  );

  for (const row of plan.toCreate) {
    if (!row.company_id) continue;
    let phone = `TEMP-NSSF-${String(createIndex).padStart(4, "0")}`;
    while (usedPhones.has(phone)) {
      createIndex += 1;
      phone = `TEMP-NSSF-${String(createIndex).padStart(4, "0")}`;
    }
    usedPhones.add(phone);
    createIndex += 1;

    const employeeId = nanoid();
    const userId = nanoid();
    const pin = generatePIN();
    const passwordHash = await bcrypt.hash(pin, 10);

    await db.execute({
      sql: `INSERT INTO employees
              (id, name, phone, type, department, company_id, daily_rate, monthly_salary,
               overtime_rule, deduct_nssf, active)
            VALUES (?, ?, ?, 'fulltime', NULL, ?, 0, 0, 'none', 1, 1)`,
      args: [employeeId, row.source_name, phone, row.company_id],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, role, phone, password_hash, plain_pin, employee_id)
            VALUES (?, ?, 'employee', ?, ?, ?, ?)`,
      args: [userId, row.source_name, phone, passwordHash, pin, employeeId],
    });
    await db.execute({
      sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
            VALUES (?, ?, 'created', NULL, 1, 'Imported from NSSF list', ?)`,
      args: [nanoid(), employeeId, session.user.id ?? null],
    });
    created.push({ name: row.source_name, company_name: row.company_name, phone });
  }

  return NextResponse.json({
    dry_run: false,
    totals,
    flagged,
    assigned,
    created: created.length,
    created_people: created,
    skipped: {
      fuzzy_review: plan.fuzzyReview,
      ambiguous: plan.ambiguous,
      other_company: plan.otherCompany,
      company_missing: plan.companyMissing,
    },
  });
}
