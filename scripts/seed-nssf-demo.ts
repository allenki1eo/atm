/**
 * Local demo data for the Master Roll attendance screen.
 * Uses TURSO_DATABASE_URL (defaults to file:local.db). Do not point this at production.
 */
import { createClient } from "@libsql/client";
import { tanzaniaHolidaysForYear } from "../lib/tanzania-holidays";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
if (/^libsql:|^https?:/i.test(url)) {
  console.error("Refusing to seed a remote database.");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const companies = [
  { id: "co-eastl", name: "East African Spirit (T) Ltd" },
  { id: "co-gaki", name: "Gaki Investment Co Ltd" },
  { id: "co-gk", name: "GK Packaging Co. Ltd" },
];

const existing = [
  { name: "AGRIPINA GIRIMANI HELMAN", company: "co-eastl", nssf: 0 },
  { name: "MATIMWA KULWA KITANGE", company: "co-eastl", nssf: 1 },
  { name: "CATHERINE MAHEGA MALAIKA", company: "co-eastl", nssf: 0 },
  { name: "DONALD MHUGO MASUNGA", company: "co-eastl", nssf: 0 },
  { name: "EMMANUEL TITO BUNDALA", company: "co-eastl", nssf: 0 },
  { name: "Valentine Pancras Sarimbo", company: "co-eastl", nssf: 1 },
  { name: "Immaculata Melchiory Temu", company: "co-eastl", nssf: 1 },
  { name: "Dennis Gilead Kileo", company: "co-gaki", nssf: 0 },
  { name: "Erick Hanson Kileo", company: "co-gaki", nssf: 0 },
  { name: "Lucy Loth Kimath", company: "co-gaki", nssf: 1 },
  { name: "Marco Masunga Mwandu", company: "co-gk", nssf: 0 },
];

async function main() {
  const { ensureDatabase, seedDemoData } = await import("../lib/db");
  await ensureDatabase();
  await seedDemoData();

  for (const c of companies) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO companies (id, name, address) VALUES (?, ?, ?)",
      args: [c.id, c.name, "Tanzania"],
    });
  }

  let i = 1;
  for (const emp of existing) {
    const found = await db.execute({
      sql: "SELECT id FROM employees WHERE LOWER(name) = LOWER(?)",
      args: [emp.name],
    });
    if (found.rows.length) {
      await db.execute({
        sql: "UPDATE employees SET company_id = ?, deduct_nssf = ?, type = 'fulltime', monthly_salary = 400000 WHERE id = ?",
        args: [emp.company, emp.nssf, String(found.rows[0].id)],
      });
      continue;
    }
    const id = `emp-nssf-${i}`;
    const phone = `+25570000${String(1000 + i).slice(-4)}`;
    await db.execute({
      sql: `INSERT INTO employees (id, name, phone, type, department, company_id, daily_rate, monthly_salary, overtime_rule, deduct_nssf, active)
            VALUES (?, ?, ?, 'fulltime', 'Production', ?, 0, 400000, 'none', ?, 1)`,
      args: [id, emp.name, phone, emp.company, emp.nssf],
    });
    i += 1;
  }

  const valentine = await db.execute({
    sql: "SELECT id FROM employees WHERE LOWER(name) LIKE '%sarimbo%'",
  });
  if (valentine.rows.length) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO leave_requests
              (id, employee_id, start_date, end_date, days, reason, leave_type, status)
            VALUES ('leave-nssf-demo', ?, '2026-11-16', '2026-11-20', 5, 'Likizo ya demo', 'annual', 'approved')`,
      args: [String(valentine.rows[0].id)],
    });
  }

  for (const year of [2025, 2026, 2027]) {
    for (const h of tanzaniaHolidaysForYear(year)) {
      try {
        await db.execute({
          sql: "INSERT INTO holidays (id, date, name, company_id) VALUES (?, ?, ?, NULL)",
          args: [`hol-${h.date}`, h.date, h.name],
        });
      } catch {
        // unique(date, company_id) already present
      }
    }
  }

  const counts = await db.execute("SELECT COUNT(*) as n FROM employees");
  const nssf = await db.execute("SELECT COUNT(*) as n FROM employees WHERE deduct_nssf = 1");
  const hol = await db.execute("SELECT COUNT(*) as n FROM holidays");
  console.log(
    `Seeded local demo: ${counts.rows[0].n} employees, ${nssf.rows[0].n} already on Master Roll, ${hol.rows[0].n} holidays`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
