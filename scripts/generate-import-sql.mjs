/**
 * Generate SQL INSERT statements for bulk employee import.
 *
 * Usage (run from project root):
 *   node scripts/generate-import-sql.mjs > scripts/import-employees.sql
 *
 * Then paste the SQL into the Turso dashboard or run:
 *   turso db shell <your-db-name> < scripts/import-employees.sql
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EDIT THE DATA BELOW — add as many companies/employees as you like.
 * Leave phone blank ("") to use a TEMP placeholder (update later in the app).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

// ═══════════════════════════════════════════════════════════════════════════
//  EMPLOYEE DATA  —  edit this section only
// ═══════════════════════════════════════════════════════════════════════════

const EMPLOYEES = [
  // ── East African Spirit (T) Ltd ──────────────────────────────────────────
  { name: "CATHERINE MAHEGA MALAIKA",   phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 350000 },
  { name: "DAUD MATHIAS SHANA",         phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "FRANCES ERNEST NGANIKO",     phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 550000 },
  { name: "HAMISI SHIJA HAMISI",        phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "KULWA PAUL MASANJA",         phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 230000 },
  { name: "VENANCE PIUS KABADO",        phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 230000 },
  { name: "IMMACULATA MELCHIORY TEMU",  phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Accountant", monthly_salary: 650000 },
  { name: "ELIZABETH JOHN MAKOLO",      phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 230000 },
  { name: "JOSEPHINA JAPHET MASUNGA",   phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 500000 },
  { name: "BERNATUS COSTANTINE MEDARD", phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 550000 },
  { name: "JANETH JAMES MWANDU",        phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 230000 },
  { name: "FILIMON LAZARO BUNDALA",     phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 400000 },
  { name: "EMMANUEL TITO BUNDALA",      phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "MASUNGA CHARLES MHUGE",      phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "ZAITUNI RAMADHANI RASHIDI",  phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 230000 },
  { name: "BENEDICTOR JOHN JAGADI",     phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 650000 },
  { name: "BIDA MACHIBULA JILALA",      phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "DONALD MHUGO MASUNGA",       phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "EDWIN SAIMON ERASTO",        phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 350000 },
  { name: "HELENA BUNWA ABEL",          phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 400000 },
  { name: "KIROCHI SEMBERA KIROCHI",    phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 550000 },
  { name: "NAUMU MATHIAS ZACHARIA",     phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 550000 },
  { name: "RICHARD MUGISHA GERVAS",     phone: "", company: "East African Spirit (T) Ltd", section: "Sales",             department: "Sales",      monthly_salary: 700000 },
  { name: "DOTTO YUSTO DOGANI",         phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 300000 },
  { name: "AGRIPINA GIRIMANI HELMAN",   phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 300000 },
  { name: "ROBERT KAFYEKA LULYEHO",     phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 550000 },
  { name: "VALENTINE PANCRAS SARIMBO",  phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 1800000 },
  { name: "DOTTO PAUL MASANJA",         phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani Spirit",  department: "Production", monthly_salary: 230000 },
  { name: "AHMED MOHAMED THANI",        phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 300000 },
  { name: "FREDY MASUNGA MAKINDO",      phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 550000 },
  { name: "MATIMWA KULWA KITANGE",      phone: "", company: "East African Spirit (T) Ltd", section: "Drivers",           department: "Drivers",    monthly_salary: 250000 },
  { name: "SAUDA NTANDU ABDALA",        phone: "", company: "East African Spirit (T) Ltd", section: "Kiwandani VIctoria", department: "Production", monthly_salary: 350000 },

  // ── Add employees from other companies below ─────────────────────────────
  // { name: "FULL NAME HERE",  phone: "255700000000", company: "Company Name", section: "Section Name", department: "Production", monthly_salary: 300000 },
];

// ═══════════════════════════════════════════════════════════════════════════
//  GENERATOR  —  no need to edit below this line
// ═══════════════════════════════════════════════════════════════════════════

function generatePIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function q(str) {
  // Escape single quotes for SQL
  return `'${String(str ?? "").replace(/'/g, "''")}'`;
}

const lines = [];
const pinSheet = [];

lines.push("-- ─────────────────────────────────────────────────────────────");
lines.push("-- Employee import — generated by generate-import-sql.mjs");
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push("-- ─────────────────────────────────────────────────────────────");
lines.push("");
lines.push("-- Schema migration (safe to run even if column exists — will error and stop,");
lines.push("-- so run this separately first if your DB client stops on errors):");
lines.push("ALTER TABLE users ADD COLUMN plain_pin TEXT;");
lines.push("");
lines.push("-- ── Employees ────────────────────────────────────────────────");

let tempIndex = 1;

for (const emp of EMPLOYEES) {
  const phone = emp.phone?.trim() || `TEMP-${String(tempIndex++).padStart(3, "0")}`;
  const pin = generatePIN();
  const hash = await bcrypt.hash(pin, 10);
  const employeeId = nanoid();
  const userId = nanoid();
  const eventId = nanoid();

  lines.push("");
  lines.push(`-- ${emp.name}`);

  // employees row — company_id and section_id looked up by name at runtime
  lines.push(`INSERT OR IGNORE INTO employees`);
  lines.push(`  (id, name, phone, type, department,`);
  lines.push(`   company_id, section_id,`);
  lines.push(`   daily_rate, monthly_salary, food_advance_amount, overtime_rule)`);
  lines.push(`SELECT`);
  lines.push(`  ${q(employeeId)}, ${q(emp.name)}, ${q(phone)}, 'fulltime', ${q(emp.department)},`);
  lines.push(`  (SELECT id FROM companies WHERE LOWER(name) = LOWER(${q(emp.company)}) LIMIT 1),`);
  lines.push(`  (SELECT s.id FROM sections s`);
  lines.push(`     JOIN companies c ON c.id = s.company_id`);
  lines.push(`     WHERE LOWER(s.name) = LOWER(${q(emp.section)})`);
  lines.push(`       AND LOWER(c.name) = LOWER(${q(emp.company)}) LIMIT 1),`);
  lines.push(`  0, ${emp.monthly_salary}, 0, 'none'`);
  lines.push(`WHERE NOT EXISTS (SELECT 1 FROM employees WHERE LOWER(name) = LOWER(${q(emp.name)}));`);

  // users row
  lines.push(`INSERT OR IGNORE INTO users`);
  lines.push(`  (id, name, role, phone, password_hash, plain_pin, employee_id)`);
  lines.push(`SELECT`);
  lines.push(`  ${q(userId)}, ${q(emp.name)}, 'employee', ${q(phone)},`);
  lines.push(`  ${q(hash)}, ${q(pin)},`);
  lines.push(`  (SELECT id FROM employees WHERE LOWER(name) = LOWER(${q(emp.name)}) LIMIT 1)`);
  lines.push(`WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = ${q(phone)});`);

  // status event
  lines.push(`INSERT OR IGNORE INTO employee_status_events`);
  lines.push(`  (id, employee_id, action, from_active, to_active, note, changed_by)`);
  lines.push(`SELECT`);
  lines.push(`  ${q(eventId)},`);
  lines.push(`  (SELECT id FROM employees WHERE LOWER(name) = LOWER(${q(emp.name)}) LIMIT 1),`);
  lines.push(`  'created', NULL, 1, 'Imported via SQL script', NULL`);
  lines.push(`WHERE NOT EXISTS (`);
  lines.push(`  SELECT 1 FROM employee_status_events`);
  lines.push(`  WHERE employee_id = (SELECT id FROM employees WHERE LOWER(name) = LOWER(${q(emp.name)}) LIMIT 1)`);
  lines.push(`    AND action = 'created');`);

  pinSheet.push({ name: emp.name, phone, pin });
}

// Output SQL to stdout
console.log(lines.join("\n"));

// Print PIN sheet to stderr so it doesn't mix with the SQL
process.stderr.write("\n\n📋 PIN SHEET — save this before distributing phones/credentials\n");
process.stderr.write("─".repeat(72) + "\n");
process.stderr.write(`${"Name".padEnd(38)} ${"Phone".padEnd(14)} PIN\n`);
process.stderr.write("─".repeat(72) + "\n");
for (const r of pinSheet) {
  process.stderr.write(`${r.name.padEnd(38)} ${r.phone.padEnd(14)} ${r.pin}\n`);
}
process.stderr.write("─".repeat(72) + "\n");
