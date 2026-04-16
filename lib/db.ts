import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken,
});

export async function initializeDatabase() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('supervisor', 'hr', 'admin')) NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
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
  `);
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
      ('emp-1', 'John Doe', '+1234567001', 'casual', 'Operations', 'user-sup-1', 1500, 0, 'none'),
      ('emp-2', 'Jane Smith', '+1234567002', 'casual', 'Operations', 'user-sup-1', 1500, 0, 'none'),
      ('emp-3', 'Bob Johnson', '+1234567003', 'fulltime', 'Finance', 'user-sup-1', 0, 300000, 'all_days'),
      ('emp-4', 'Alice Brown', '+1234567004', 'casual', 'Operations', 'user-sup-1', 1500, 0, 'none'),
      ('emp-5', 'Charlie Wilson', '+1234567005', 'fulltime', 'HR', 'user-sup-1', 0, 250000, 'none'),
      ('emp-6', 'Diana Prince', '+1234567006', 'casual', 'Operations', 'user-sup-1', 2000, 0, 'none'),
      ('emp-7', 'Eve Adams', '+1234567007', 'casual', 'Warehouse', 'user-sup-1', 1500, 0, 'none'),
      ('emp-8', 'Frank Miller', '+1234567008', 'casual', 'Warehouse', 'user-sup-1', 1500, 0, 'none');
  `);
}
