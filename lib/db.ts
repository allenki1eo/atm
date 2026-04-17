import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken,
});

// Module-level flag so we only run migrations once per server cold-start,
// not on every request. Routes call ensureDatabase() instead of
// initializeDatabase() directly.
let _initialized = false;
export async function ensureDatabase() {
  if (_initialized) return;
  await initializeDatabase();
  _initialized = true;
}

export async function initializeDatabase() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('supervisor', 'hr', 'admin', 'employee')) NOT NULL,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      employee_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      type TEXT CHECK(type IN ('casual', 'fulltime')) NOT NULL,
      department TEXT,
      supervisor_id TEXT,
      daily_rate INTEGER DEFAULT 0,
      monthly_salary INTEGER DEFAULT 0,
      overtime_rule TEXT CHECK(overtime_rule IN ('all_days', 'holidays_only', 'none')) DEFAULT 'none',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date DATE NOT NULL,
      status TEXT CHECK(status IN ('present', 'absent', 'late', 'half_day')) NOT NULL,
      marked_by TEXT NOT NULL,
      marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      is_locked INTEGER DEFAULT 0,
      UNIQUE(employee_id, date),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (marked_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      type TEXT CHECK(type IN ('advance_given', 'advance_deducted', 'salary_paid')) NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_periods (
      id TEXT PRIMARY KEY,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT CHECK(status IN ('open', 'locked', 'paid')) DEFAULT 'open',
      locked_at DATETIME,
      locked_by TEXT,
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS payslips (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      period_id TEXT NOT NULL,
      days_worked INTEGER DEFAULT 0,
      gross_amount INTEGER DEFAULT 0,
      total_advances INTEGER DEFAULT 0,
      net_amount INTEGER DEFAULT 0,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_sms INTEGER DEFAULT 0,
      UNIQUE(employee_id, period_id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (period_id) REFERENCES payroll_periods(id)
    );

    CREATE TABLE IF NOT EXISTS sms_queue (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS offline_sync_queue (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      cotwu_rate INTEGER DEFAULT 2,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS supervisor_sections (
      supervisor_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      PRIMARY KEY (supervisor_id, section_id)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      review_note TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      allowed_days INTEGER DEFAULT 28,
      used_days INTEGER DEFAULT 0,
      UNIQUE(employee_id, year),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS advance_schedules (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      total_debt INTEGER NOT NULL,
      monthly_deduction INTEGER NOT NULL,
      remaining_debt INTEGER NOT NULL,
      notes TEXT,
      status TEXT CHECK(status IN ('active','cleared')) DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT CHECK(status IN ('open','resolved')) DEFAULT 'open',
      response TEXT,
      responded_by TEXT,
      responded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      audience_type TEXT CHECK(audience_type IN ('all','company','section','role')) NOT NULL,
      audience_id TEXT,
      send_sms INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS announcement_reads (
      announcement_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id)
    );
  `);

  await migrateDatabase();
}

export async function migrateDatabase() {
  const employeeColumns = [
    "ALTER TABLE employees ADD COLUMN company_id TEXT",
    "ALTER TABLE employees ADD COLUMN section_id TEXT",
    "ALTER TABLE employees ADD COLUMN deduct_nssf INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN deduct_cotwu INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN deduct_fadhila INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN heslb_amount INTEGER DEFAULT 0",
  ];

  const leaveColumns = [
    "ALTER TABLE leave_requests ADD COLUMN leave_type TEXT",
    "ALTER TABLE leave_requests ADD COLUMN employee_phone TEXT",
  ];

  const payslipColumns = [
    "ALTER TABLE payslips ADD COLUMN nssf_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN cotwu_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN fadhila_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN heslb_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN total_deductions INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN leave_days INTEGER DEFAULT 0",
  ];

  for (const sql of [...employeeColumns, ...payslipColumns, ...leaveColumns]) {
    try {
      await db.execute(sql);
    } catch {
      // Silently ignore duplicate column errors
    }
  }
}

export async function seedDemoData() {
  const bcrypt = await import("bcryptjs");

  const existingUsers = await db.execute("SELECT COUNT(*) as count FROM users");
  if ((existingUsers.rows[0] as unknown as { count: number }).count > 0) return;

  const adminHash = await bcrypt.hash("admin123", 10);
  const supervisorHash = await bcrypt.hash("supervisor123", 10);
  const hrHash = await bcrypt.hash("hr123", 10);

  await db.executeMultiple(`
    INSERT INTO users (id, email, name, role, phone, password_hash) VALUES
      ('user-admin-1', 'admin@trusttrack.com', 'Admin User', 'admin', '+1234567890', '${adminHash}'),
      ('user-sup-1', 'supervisor@trusttrack.com', 'Jane Supervisor', 'supervisor', '+1234567891', '${supervisorHash}'),
      ('user-hr-1', 'hr@trusttrack.com', 'HR Manager', 'hr', '+1234567892', '${hrHash}');

    INSERT INTO employees (id, name, phone, type, department, supervisor_id, daily_rate, monthly_salary, overtime_rule) VALUES
      ('emp-1', 'Juma Salim', '+255712345001', 'casual', 'Uendeshaji', 'user-sup-1', 15000, 0, 'none'),
      ('emp-2', 'Fatuma Hassan', '+255712345002', 'casual', 'Uendeshaji', 'user-sup-1', 15000, 0, 'none'),
      ('emp-3', 'Robert Mwangi', '+255712345003', 'fulltime', 'Fedha', 'user-sup-1', 0, 800000, 'all_days'),
      ('emp-4', 'Amina Bakari', '+255712345004', 'casual', 'Uendeshaji', 'user-sup-1', 15000, 0, 'none'),
      ('emp-5', 'Charles Osei', '+255712345005', 'fulltime', 'Utumishi', 'user-sup-1', 0, 650000, 'none'),
      ('emp-6', 'Dina Njau', '+255712345006', 'casual', 'Uendeshaji', 'user-sup-1', 18000, 0, 'none'),
      ('emp-7', 'Eva Moshi', '+255712345007', 'casual', 'Ghala', 'user-sup-1', 15000, 0, 'none'),
      ('emp-8', 'Frank Kimani', '+255712345008', 'casual', 'Ghala', 'user-sup-1', 15000, 0, 'none');
  `);

  await db.execute(
    `INSERT OR IGNORE INTO companies (id, name, address) VALUES ('co-1', 'East African Spirit Ltd', 'Dar es Salaam, Tanzania')`
  );
}
