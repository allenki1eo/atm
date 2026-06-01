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
  // Schema migrations — safe to run repeatedly (errors mean column already exists)
  try { await db.execute("ALTER TABLE companies ADD COLUMN logo TEXT"); } catch {}
  try { await db.execute("ALTER TABLE users ADD COLUMN plain_pin TEXT"); } catch {}
  // Migrate announcements to support 'employee' audience_type if needed
  try {
    const schemaRes = await db.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='announcements'"
    );
    const ddl = (schemaRes.rows[0] as unknown as { sql: string } | undefined)?.sql ?? "";
    if (ddl && !ddl.includes("'employee'")) {
      // Drop the temp table if it survived a prior failed migration
      try { await db.execute("DROP TABLE IF EXISTS announcements_new"); } catch {}
      await db.execute(`
        CREATE TABLE announcements_new (
          id TEXT PRIMARY KEY,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          audience_type TEXT CHECK(audience_type IN ('all','company','section','role','employee')) NOT NULL,
          audience_id TEXT,
          send_sms INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);
      await db.execute("INSERT INTO announcements_new SELECT * FROM announcements");
      await db.execute("DROP TABLE announcements");
      await db.execute("ALTER TABLE announcements_new RENAME TO announcements");
    }
  } catch {}
  // Ensure overtime_entries table exists (added after initial deploy)
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS overtime_entries (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date DATE NOT NULL,
      hours REAL NOT NULL DEFAULT 9,
      amount INTEGER NOT NULL,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )`);
  } catch {}
  try { await db.execute("ALTER TABLE employees ADD COLUMN emergency_contact_name TEXT"); } catch {}
  try { await db.execute("ALTER TABLE employees ADD COLUMN emergency_contact_phone TEXT"); } catch {}
  try {
    const schemaRes = await db.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='complaints'"
    );
    const ddl = (schemaRes.rows[0] as unknown as { sql: string } | undefined)?.sql ?? "";
    if (ddl && !ddl.includes("'received'")) {
      try { await db.execute("DROP TABLE IF EXISTS complaints_new"); } catch {}
      await db.execute(`
        CREATE TABLE complaints_new (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT CHECK(status IN ('received','in_review','awaiting_employee','closed','open','resolved')) DEFAULT 'received',
          response TEXT,
          responded_by TEXT,
          responded_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
      `);
      await db.execute(`
        INSERT INTO complaints_new
          (id, employee_id, subject, message, status, response, responded_by, responded_at, created_at)
        SELECT
          id, employee_id, subject, message,
          CASE status
            WHEN 'resolved' THEN 'closed'
            ELSE 'received'
          END,
          response, responded_by, responded_at, created_at
        FROM complaints
      `);
      await db.execute("DROP TABLE complaints");
      await db.execute("ALTER TABLE complaints_new RENAME TO complaints");
    }
  } catch {}
  try {
    const schemaRes = await db.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='leave_requests'"
    );
    const ddl = (schemaRes.rows[0] as unknown as { sql: string } | undefined)?.sql ?? "";
    if (ddl && !ddl.includes("'pending_supervisor'")) {
      try { await db.execute("DROP TABLE IF EXISTS leave_requests_new"); } catch {}
      await db.execute(`
        CREATE TABLE leave_requests_new (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          days INTEGER NOT NULL,
          reason TEXT,
          status TEXT CHECK(status IN ('pending_supervisor','pending_hr','approved','denied','pending')) DEFAULT 'pending_supervisor',
          submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reviewed_by TEXT,
          reviewed_at DATETIME,
          review_note TEXT,
          leave_type TEXT,
          employee_phone TEXT,
          supervisor_reviewed_by TEXT,
          supervisor_reviewed_at DATETIME,
          supervisor_note TEXT,
          FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
      `);
      await db.execute(`
        INSERT INTO leave_requests_new
          (id, employee_id, start_date, end_date, days, reason, status, submitted_at,
           reviewed_by, reviewed_at, review_note, leave_type, employee_phone)
        SELECT
          id, employee_id, start_date, end_date, days, reason,
          CASE status WHEN 'pending' THEN 'pending_supervisor' ELSE status END,
          submitted_at, reviewed_by, reviewed_at, review_note, leave_type, employee_phone
        FROM leave_requests
      `);
      await db.execute("DROP TABLE leave_requests");
      await db.execute("ALTER TABLE leave_requests_new RENAME TO leave_requests");
    }
  } catch {}
  try { await db.execute("ALTER TABLE leave_requests ADD COLUMN supervisor_reviewed_by TEXT"); } catch {}
  try { await db.execute("ALTER TABLE leave_requests ADD COLUMN supervisor_reviewed_at DATETIME"); } catch {}
  try { await db.execute("ALTER TABLE leave_requests ADD COLUMN supervisor_note TEXT"); } catch {}
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS service_certificates (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date_employed DATE,
      date_of_leaving DATE,
      position_held TEXT,
      general_conduct TEXT DEFAULT 'Good',
      efficiency TEXT DEFAULT 'Good',
      additional_notes TEXT,
      issued_by TEXT,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )`);
  } catch {}
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
      food_advance_amount INTEGER DEFAULT 0,
      overtime_rule TEXT CHECK(overtime_rule IN ('all_days', 'holidays_only', 'none')) DEFAULT 'none',
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employee_status_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('created','deactivated','rejoined')) NOT NULL,
      from_active INTEGER,
      to_active INTEGER NOT NULL,
      note TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS employee_transfer_history (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      from_company_id TEXT,
      from_section_id TEXT,
      to_company_id TEXT,
      to_section_id TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      note TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
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
      status TEXT CHECK(status IN ('pending_supervisor','pending_hr','approved','denied','pending')) DEFAULT 'pending_supervisor',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      review_note TEXT,
      supervisor_reviewed_by TEXT,
      supervisor_reviewed_at DATETIME,
      supervisor_note TEXT,
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

    CREATE TABLE IF NOT EXISTS overtime_entries (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date DATE NOT NULL,
      hours REAL NOT NULL DEFAULT 9,
      amount INTEGER NOT NULL,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT CHECK(status IN ('received','in_review','awaiting_employee','closed','open','resolved')) DEFAULT 'received',
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
      audience_type TEXT CHECK(audience_type IN ('all','company','section','role','employee')) NOT NULL,
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

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      name TEXT NOT NULL,
      company_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, company_id)
    );

    CREATE TABLE IF NOT EXISTS advance_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      review_note TEXT,
      transaction_id TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS sms_log (
      id TEXT PRIMARY KEY,
      recipient_phone TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_by TEXT,
      source TEXT,
      status TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date DATE NOT NULL,
      original_attendance_id TEXT,
      original_status TEXT,
      requested_status TEXT NOT NULL CHECK(requested_status IN ('present','absent','late','half_day')),
      reason TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      review_note TEXT,
      applied_attendance_id TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );
  `);

  await migrateDatabase();
}

export async function migrateDatabase() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS employee_status_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('created','deactivated','rejoined')) NOT NULL,
      from_active INTEGER,
      to_active INTEGER NOT NULL,
      note TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS employee_transfer_history (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      from_company_id TEXT,
      from_section_id TEXT,
      to_company_id TEXT,
      to_section_id TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      note TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_employee_status_events_employee_id
      ON employee_status_events(employee_id);
    CREATE INDEX IF NOT EXISTS idx_employee_transfer_history_employee_id
      ON employee_transfer_history(employee_id);
  `);

  try {
    await db.execute(`
      INSERT INTO employee_status_events
        (id, employee_id, action, from_active, to_active, note, changed_by, changed_at)
      SELECT
        'status-created-' || e.id,
        e.id,
        'created',
        NULL,
        CASE WHEN COALESCE(e.active, 1) = 0 THEN 0 ELSE 1 END,
        'Existing employee backfilled into lifecycle history',
        NULL,
        COALESCE(e.created_at, CURRENT_TIMESTAMP)
      FROM employees e
      WHERE NOT EXISTS (
        SELECT 1
        FROM employee_status_events ese
        WHERE ese.employee_id = e.id
          AND ese.action = 'created'
      )
    `);
  } catch {
    // Ignore backfill races or legacy rows that were already inserted.
  }

  const employeeColumns = [
    "ALTER TABLE employees ADD COLUMN company_id TEXT",
    "ALTER TABLE employees ADD COLUMN section_id TEXT",
    "ALTER TABLE employees ADD COLUMN deduct_nssf INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN deduct_cotwu INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN deduct_fadhila INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN heslb_amount INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN wcf_amount INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN food_advance_amount INTEGER DEFAULT 0",
  ];

  const leaveColumns = [
    "ALTER TABLE leave_requests ADD COLUMN leave_type TEXT",
    "ALTER TABLE leave_requests ADD COLUMN employee_phone TEXT",
    "ALTER TABLE leave_requests ADD COLUMN supervisor_reviewed_by TEXT",
    "ALTER TABLE leave_requests ADD COLUMN supervisor_reviewed_at DATETIME",
    "ALTER TABLE leave_requests ADD COLUMN supervisor_note TEXT",
  ];

  const payslipColumns = [
    "ALTER TABLE payslips ADD COLUMN nssf_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN cotwu_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN fadhila_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN heslb_amount INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN total_deductions INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN leave_days INTEGER DEFAULT 0",
    "ALTER TABLE payslips ADD COLUMN wcf_amount INTEGER DEFAULT 0",
  ];

  const payrollPeriodColumns = [
    "ALTER TABLE payroll_periods ADD COLUMN company_id TEXT",
  ];

  const leaveBalanceColumns = [
    "ALTER TABLE leave_balances ADD COLUMN carryover_days INTEGER DEFAULT 0",
  ];

  const employeeLeaveColumns = [
    "ALTER TABLE employees ADD COLUMN leave_allowance_days INTEGER DEFAULT 28",
  ];

  const employeeEmergencyColumns = [
    "ALTER TABLE employees ADD COLUMN emergency_contact_name TEXT",
    "ALTER TABLE employees ADD COLUMN emergency_contact_phone TEXT",
  ];

  for (const sql of [
    ...employeeColumns,
    ...payslipColumns,
    ...leaveColumns,
    ...payrollPeriodColumns,
    ...leaveBalanceColumns,
    ...employeeLeaveColumns,
    ...employeeEmergencyColumns,
  ]) {
    try {
      await db.execute(sql);
    } catch {
      // Silently ignore duplicate column errors
    }
  }

  // Rebuild payroll_periods with a (month, year, company_id) unique key so
  // the same month can be locked independently per company. SQLite cannot
  // drop a UNIQUE constraint in place, so we recreate the table.
  try {
    const info = await db.execute("PRAGMA index_list(payroll_periods)");
    const hasOldUnique = info.rows.some((r) => {
      const row = r as unknown as { name: string; unique: number };
      return row.unique === 1 && row.name.startsWith("sqlite_autoindex_payroll_periods");
    });
    if (hasOldUnique) {
      await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS payroll_periods_new (
          id TEXT PRIMARY KEY,
          month INTEGER NOT NULL,
          year INTEGER NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          status TEXT CHECK(status IN ('open', 'locked', 'paid')) DEFAULT 'open',
          locked_at DATETIME,
          locked_by TEXT,
          company_id TEXT,
          UNIQUE(month, year, company_id)
        );
        INSERT INTO payroll_periods_new (id, month, year, start_date, end_date, status, locked_at, locked_by, company_id)
          SELECT id, month, year, start_date, end_date, status, locked_at, locked_by, company_id FROM payroll_periods;
        DROP TABLE payroll_periods;
        ALTER TABLE payroll_periods_new RENAME TO payroll_periods;
      `);
    }
  } catch {
    // if rebuild fails (already rebuilt, no data, etc) leave as-is
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

  await db.execute(`
    INSERT INTO employee_status_events
      (id, employee_id, action, from_active, to_active, note, changed_by, changed_at)
    SELECT
      'status-created-' || e.id,
      e.id,
      'created',
      NULL,
      CASE WHEN COALESCE(e.active, 1) = 0 THEN 0 ELSE 1 END,
      'Employee record created by demo seed',
      'user-admin-1',
      COALESCE(e.created_at, CURRENT_TIMESTAMP)
    FROM employees e
    WHERE NOT EXISTS (
      SELECT 1
      FROM employee_status_events ese
      WHERE ese.employee_id = e.id
        AND ese.action = 'created'
    )
  `);

  await db.execute(
    `INSERT OR IGNORE INTO companies (id, name, address) VALUES ('co-1', 'East African Spirit Ltd', 'Dar es Salaam, Tanzania')`
  );
}
