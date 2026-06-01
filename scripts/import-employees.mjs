/**
 * Import employees into Turso DB.
 * Run: node --env-file=.env scripts/import-employees.mjs
 *
 * NOTE: Phone numbers were missing in the source data.
 *       Placeholders like TEMP-001 are used — update them in the
 *       employees page or via SQL after import.
 */

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ── helpers ──────────────────────────────────────────────────────────────────

function generatePIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseSalary(raw) {
  return Math.round(Number(String(raw ?? "0").replace(/[,\s]/g, "")) || 0);
}

async function lookupId(table, nameCol, name, extra = {}) {
  let sql = `SELECT id FROM ${table} WHERE LOWER(${nameCol}) = LOWER(?)`;
  const args = [name.trim()];
  for (const [col, val] of Object.entries(extra)) {
    sql += ` AND ${col} = ?`;
    args.push(val);
  }
  const res = await db.execute({ sql, args });
  return res.rows.length > 0 ? res.rows[0].id : null;
}

// ── schema migration ──────────────────────────────────────────────────────────

console.log("Running migrations…");
try { await db.execute("ALTER TABLE users ADD COLUMN plain_pin TEXT"); console.log("  ✓ plain_pin column added"); }
catch { console.log("  · plain_pin column already exists"); }

// ── employee data ─────────────────────────────────────────────────────────────

const EMPLOYEES = [
  { name: "CATHERINE MAHEGA MALAIKA",   type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 350000 },
  { name: "DAUD MATHIAS SHANA",         type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "FRANCES ERNEST NGANIKO",     type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 550000 },
  { name: "HAMISI SHIJA HAMISI",        type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "KULWA PAUL MASANJA",         type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 230000 },
  { name: "VENANCE PIUS KABADO",        type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 230000 },
  { name: "IMMACULATA MELCHIORY TEMU",  type: "fulltime", department: "ACCOUNTANT", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 650000 },
  { name: "ELIZABETH JOHN MAKOLO",      type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 230000 },
  { name: "JOSEPHINA JAPHET MASUNGA",   type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 500000 },
  { name: "BERNATUS COSTANTINE MEDARD", type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 550000 },
  { name: "JANETH JAMES MWANDU",        type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 230000 },
  { name: "FILIMON LAZARO BUNDALA",     type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 400000 },
  { name: "EMMANUEL TITO BUNDALA",      type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "MASUNGA CHARLES MHUGE",      type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "ZAITUNI RAMADHANI RASHIDI",  type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 230000 },
  { name: "BENEDICTOR JOHN JAGADI",     type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 650000 },
  { name: "BIDA MACHIBULA JILALA",      type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "DONALD MHUGO MASUNGA",       type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "EDWIN SAIMON ERASTO",        type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 350000 },
  { name: "HELENA BUNWA ABEL",          type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 400000 },
  { name: "KIROCHI SEMBERA KIROCHI",    type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 550000 },
  { name: "NAUMU MATHIAS ZACHARIA",     type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 550000 },
  { name: "RICHARD MUGISHA GERVAS",     type: "fulltime", department: "Sales",      company: "East African Spirit (T) Ltd", section: "Sales",             monthly_salary: 700000 },
  { name: "DOTTO YUSTO DOGANI",         type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 300000 },
  { name: "AGRIPINA GIRIMANI HELMAN",   type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 300000 },
  { name: "ROBERT KAFYEKA LULYEHO",     type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 550000 },
  { name: "VALENTINE PANCRAS SARIMBO",  type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 1800000 },
  { name: "DOTTO PAUL MASANJA",         type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",   monthly_salary: 230000 },
  { name: "AHMED MOHAMED THANI",        type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 300000 },
  { name: "FREDY MASUNGA MAKINDO",      type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 550000 },
  { name: "MATIMWA KULWA KITANGE",      type: "fulltime", department: "Drivers",    company: "East African Spirit (T) Ltd", section: "Drivers",           monthly_salary: 250000 },
  { name: "SAUDA NTANDU ABDALA",        type: "fulltime", department: "Production", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", monthly_salary: 350000 },
];

// ── resolve company & sections upfront ───────────────────────────────────────

const companyId = await lookupId("companies", "name", "East African Spirit (T) Ltd");
if (!companyId) {
  console.error("❌ Company 'East African Spirit (T) Ltd' not found in DB. Aborting.");
  process.exit(1);
}
console.log(`✓ Company found: ${companyId}`);

const sectionCache = {};
for (const { section } of EMPLOYEES) {
  if (sectionCache[section] !== undefined) continue;
  const id = await lookupId("sections", "name", section, { company_id: companyId });
  sectionCache[section] = id;
  if (!id) console.warn(`  ⚠ Section not found: "${section}" — will insert with NULL section_id`);
  else console.log(`  · Section "${section}" → ${id}`);
}

// ── insert loop ───────────────────────────────────────────────────────────────

console.log("\nInserting employees…");
const report = [];

for (let i = 0; i < EMPLOYEES.length; i++) {
  const emp = EMPLOYEES[i];
  const phone = `TEMP-${String(i + 1).padStart(3, "0")}`;
  const sectionId = sectionCache[emp.section] ?? null;
  const employeeId = nanoid();
  const userId = nanoid();
  const pin = generatePIN();
  const passwordHash = await bcrypt.hash(pin, 10);

  // Skip if name already exists (idempotent re-runs)
  const existing = await db.execute({
    sql: "SELECT id FROM employees WHERE LOWER(name) = LOWER(?)",
    args: [emp.name],
  });
  if (existing.rows.length > 0) {
    console.log(`  ⏭  SKIP (exists): ${emp.name}`);
    report.push({ name: emp.name, status: "skipped" });
    continue;
  }

  try {
    await db.execute({
      sql: `INSERT INTO employees
              (id, name, phone, type, department, company_id, section_id,
               daily_rate, monthly_salary, food_advance_amount, overtime_rule)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 'none')`,
      args: [employeeId, emp.name, phone, emp.type, emp.department,
             companyId, sectionId, emp.monthly_salary],
    });

    await db.execute({
      sql: `INSERT INTO users (id, name, role, phone, password_hash, plain_pin, employee_id)
            VALUES (?, ?, 'employee', ?, ?, ?, ?)`,
      args: [userId, emp.name, phone, passwordHash, pin, employeeId],
    });

    await db.execute({
      sql: `INSERT INTO employee_status_events
              (id, employee_id, action, from_active, to_active, note, changed_by)
            VALUES (?, ?, 'created', NULL, 1, 'Imported via seed script', NULL)`,
      args: [nanoid(), employeeId],
    });

    console.log(`  ✓ ${emp.name}  PIN: ${pin}  phone: ${phone}`);
    report.push({ name: emp.name, phone, pin, status: "inserted" });
  } catch (err) {
    // Roll back partial inserts
    await db.execute({ sql: "DELETE FROM employees WHERE id = ?", args: [employeeId] }).catch(() => {});
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] }).catch(() => {});
    console.error(`  ❌ ${emp.name}: ${err.message}`);
    report.push({ name: emp.name, status: "error", error: err.message });
  }
}

// ── summary ───────────────────────────────────────────────────────────────────

const inserted = report.filter(r => r.status === "inserted");
const skipped  = report.filter(r => r.status === "skipped");
const errors   = report.filter(r => r.status === "error");

console.log(`\n─────────────────────────────────────────`);
console.log(`Inserted : ${inserted.length}`);
console.log(`Skipped  : ${skipped.length}`);
console.log(`Errors   : ${errors.length}`);

if (inserted.length > 0) {
  console.log("\n📋 PIN sheet (update phones before sharing):");
  console.log("Name                                | Phone     | PIN");
  console.log("─".repeat(60));
  for (const r of inserted) {
    console.log(`${r.name.padEnd(35)} | ${r.phone.padEnd(9)} | ${r.pin}`);
  }
}

process.exit(errors.length > 0 ? 1 : 0);
