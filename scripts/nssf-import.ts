/**
 * Dry-run (default) or apply NSSF employee list matching.
 *
 *   node --env-file=.env.local scripts/nssf-import.ts
 *   node --env-file=.env.local scripts/nssf-import.ts --apply
 *
 * Without --apply this is read-only. Do not pass production credentials
 * together with --apply unless you intend to write.
 */
import { createClient } from "@libsql/client";
import { flattenNssfLists } from "../lib/nssf-lists";
import { planNssfImport } from "../lib/nssf-import";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
  const isRemote = /^libsql:|^https?:/i.test(url);

  if (apply && isRemote) {
    console.error("Refusing --apply against a remote Turso URL. Run apply from the admin UI after review, or point TURSO_DATABASE_URL at a local file.");
    process.exit(1);
  }

  const db = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const companies = await db.execute("SELECT id, name FROM companies ORDER BY name");
  const employees = await db.execute(`
    SELECT e.id, e.name, e.company_id, e.deduct_nssf, e.active, c.name AS company_name
    FROM employees e
    LEFT JOIN companies c ON c.id = e.company_id
    ORDER BY e.name
  `);

  const plan = planNssfImport(
    flattenNssfLists(),
    companies.rows.map((r) => ({ id: String(r.id), name: String(r.name) })),
    employees.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      company_id: r.company_id ? String(r.company_id) : null,
      company_name: r.company_name ? String(r.company_name) : null,
      deduct_nssf: Number(r.deduct_nssf ?? 0),
      active: Number(r.active ?? 1),
    }))
  );

  function printSection<T>(title: string, rows: T[], pick: (row: T) => string) {
    console.log(`\n${title} (${rows.length})`);
    if (!rows.length) {
      console.log("  (none)");
      return;
    }
    for (const row of rows) console.log("  " + pick(row));
  }

  console.log(apply ? "MODE: APPLY (local only)" : "MODE: DRY-RUN (no writes)");
  console.log(`Database: ${isRemote ? "remote Turso (read-only in this script)" : "local file"}`);
  console.log(`Listed from PDFs: ${plan.rows.length}`);
  console.log(`Already on NSSF:  ${plan.alreadyNssf.length}`);
  console.log(`Will set NSSF:    ${plan.setNssf.length}`);
  console.log(`Will create:      ${plan.toCreate.length}`);
  console.log(`Unassigned:       ${plan.unassigned.length}`);
  console.log(`Fuzzy review:     ${plan.fuzzyReview.length}`);
  console.log(`Ambiguous:        ${plan.ambiguous.length}`);
  console.log(`Other company:    ${plan.otherCompany.length}`);
  console.log(`Company missing:  ${plan.companyMissing.length}`);

  printSection("Will set NSSF flag", plan.setNssf, (r) => `${r.source_name}  →  ${r.employee_name} (${r.company_name ?? ""}${r.note ? "; " + r.note : ""})`);
  printSection("Already on NSSF", plan.alreadyNssf, (r) => `${r.source_name}  →  ${r.employee_name}`);
  printSection("Will create", plan.toCreate, (r) => `${r.source_name}  @  ${r.company_name ?? r.source_company}`);
  printSection("Unassigned in AtWork — will set NSSF and attach to company", plan.unassigned, (r) => `${r.source_name}  →  ${r.employee_name} (${r.company_name ?? r.source_company})`);
  printSection("Fuzzy match — needs a decision", plan.fuzzyReview, (r) => `${r.source_name}  →  ${r.employee_name ?? "?"} (${Math.round((r.score ?? 0) * 100)}%) ${r.note ?? ""}`);
  printSection("Ambiguous — needs a decision", plan.ambiguous, (r) => `${r.source_name}  @  ${r.source_company}: ${r.note ?? ""}`);
  printSection("Name found in another company — needs a decision", plan.otherCompany, (r) => `${r.source_name} (${r.source_company})  looks like  ${r.employee_name} (${r.company_name ?? "?"})`);
  printSection("Company not found in AtWork", plan.companyMissing, (r) => `${r.source_name}  @  ${r.source_company}`);

  if (apply) {
    let flagged = 0;
    for (const row of plan.setNssf) {
      if (!row.employee_id) continue;
      await db.execute({ sql: "UPDATE employees SET deduct_nssf = 1 WHERE id = ?", args: [row.employee_id] });
      flagged++;
    }
    console.log(`\nApplied NSSF flag to ${flagged} existing employee(s).`);
    console.log("Creating missing employees is only done from the admin UI, so placeholder phones stay consistent.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
