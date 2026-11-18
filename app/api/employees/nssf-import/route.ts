import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { flattenNssfLists, type NssfListPerson } from "@/lib/nssf-lists";
import { isPendingCompanyId, pendingCompanyId, planNssfImport, type ImportEmployee, type ImportPlan } from "@/lib/nssf-import";
import { matchCompany } from "@/lib/name-match";


async function ensurePlannedCompanies(plan: ImportPlan): Promise<{ map: Map<string, string>; created: string[] }> {
  const map = new Map<string, string>();
  const created: string[] = [];
  const existing = await db.execute("SELECT id, name FROM companies");
  const companies = existing.rows as unknown as { id: string; name: string }[];
  for (const planned of plan.companiesToCreate) {
    const match = matchCompany(planned.name, companies);
    if (match.kind === "exact" || match.kind === "fuzzy") {
      map.set(pendingCompanyId(planned.name), match.match.value.id);
      continue;
    }
    const id = nanoid();
    await db.execute({
      sql: "INSERT INTO companies (id, name, address) VALUES (?, ?, ?)",
      args: [id, planned.name, null],
    });
    companies.push({ id, name: planned.name });
    map.set(pendingCompanyId(planned.name), id);
    created.push(planned.name);
  }
  return { map, created };
}

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function loadEmployeesAndCompanies() {
  const companies = await db.execute("SELECT id, name FROM companies ORDER BY name");
  const employees = await db.execute(`
    SELECT e.id, e.name, e.company_id, e.section_id, e.deduct_nssf, e.active, c.name AS company_name
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
      move_company: plan.moveCompany.length,
      companies_to_create: plan.companiesToCreate.length,
      fuzzy_review: plan.fuzzyReview.length,
      ambiguous: plan.ambiguous.length,
      other_company: plan.otherCompany.length,
      company_missing: plan.companyMissing.length,
      override_missing: plan.overrideMissing.length,
    },
    set_nssf: plan.setNssf,
    already_nssf: plan.alreadyNssf,
    unassigned: plan.unassigned,
    fuzzy_review: plan.fuzzyReview,
    to_create: plan.toCreate,
    move_company: plan.moveCompany,
    companies_to_create: plan.companiesToCreate,
    ambiguous: plan.ambiguous,
    other_company: plan.otherCompany,
    company_missing: plan.companyMissing,
    override_missing: plan.overrideMissing,
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
    move_company: plan.moveCompany.length,
    companies_to_create: plan.companiesToCreate.length,
    fuzzy_review: plan.fuzzyReview.length,
    ambiguous: plan.ambiguous.length,
    other_company: plan.otherCompany.length,
    company_missing: plan.companyMissing.length,
    override_missing: plan.overrideMissing.length,
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
      move_company: plan.moveCompany,
      companies_to_create: plan.companiesToCreate,
      ambiguous: plan.ambiguous,
      other_company: plan.otherCompany,
      company_missing: plan.companyMissing,
      override_missing: plan.overrideMissing,
    });
  }

  const ensured = await ensurePlannedCompanies(plan);
  const companyIds = ensured.map;
  const createdCompanies = ensured.created;
  const resolveCompanyId = (id?: string) => (id && companyIds.get(id)) || id;

  let flagged = 0;
  let assigned = 0;
  let moved = 0;

  for (const row of plan.setNssf) {
    if (!row.employee_id) continue;
    await db.execute({
      sql: "UPDATE employees SET deduct_nssf = 1 WHERE id = ?",
      args: [row.employee_id],
    });
    flagged++;
  }
  for (const row of plan.unassigned) {
    const companyId = resolveCompanyId(row.company_id);
    if (!row.employee_id || !companyId || isPendingCompanyId(companyId)) continue;
    await db.execute({
      sql: "UPDATE employees SET deduct_nssf = 1, company_id = ? WHERE id = ?",
      args: [companyId, row.employee_id],
    });
    flagged++;
    assigned++;
  }
  for (const row of plan.moveCompany) {
    const companyId = resolveCompanyId(row.company_id);
    if (!row.employee_id || !companyId || isPendingCompanyId(companyId)) continue;
    await db.execute({
      sql: "UPDATE employees SET deduct_nssf = 1, company_id = ?, section_id = NULL WHERE id = ?",
      args: [companyId, row.employee_id],
    });
    await db.execute({
      sql: `INSERT INTO employee_transfer_history
              (id, employee_id, from_company_id, from_section_id, to_company_id, to_section_id, changed_by, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nanoid(),
        row.employee_id,
        row.from_company_id ?? null,
        row.from_section_id ?? null,
        companyId,
        null,
        session.user.id ?? null,
        row.note ?? "Master Roll import: company reassigned",
      ],
    });
    flagged++;
    moved++;
  }

  const created: { name: string; company_name?: string; phone: string }[] = [];
  let createIndex = 1;
  const existingTemps = await db.execute(
    "SELECT phone FROM employees WHERE phone LIKE 'TEMP-NSSF-%' OR phone LIKE 'TEMP-MR-%'"
  );
  const usedPhones = new Set(
    (existingTemps.rows as unknown as { phone: string }[]).map((r) => r.phone)
  );

  for (const row of plan.toCreate) {
    const companyId = resolveCompanyId(row.company_id);
    if (!companyId || isPendingCompanyId(companyId)) continue;
    let phone = `TEMP-MR-${String(createIndex).padStart(4, "0")}`;
    while (usedPhones.has(phone)) {
      createIndex += 1;
      phone = `TEMP-MR-${String(createIndex).padStart(4, "0")}`;
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
      args: [employeeId, row.source_name, phone, companyId],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, role, phone, password_hash, plain_pin, employee_id)
            VALUES (?, ?, 'employee', ?, ?, ?, ?)`,
      args: [userId, row.source_name, phone, passwordHash, pin, employeeId],
    });
    await db.execute({
      sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
            VALUES (?, ?, 'created', NULL, 1, 'Imported from Master Roll list', ?)`,
      args: [nanoid(), employeeId, session.user.id ?? null],
    });
    created.push({ name: row.source_name, company_name: row.company_name, phone });
  }

  return NextResponse.json({
    dry_run: false,
    totals,
    flagged,
    assigned,
    moved,
    created_companies: createdCompanies,
    created: created.length,
    created_people: created,
    skipped: {
      fuzzy_review: plan.fuzzyReview,
      ambiguous: plan.ambiguous,
      other_company: plan.otherCompany,
      company_missing: plan.companyMissing,
      override_missing: plan.overrideMissing,
    },
  });
}
