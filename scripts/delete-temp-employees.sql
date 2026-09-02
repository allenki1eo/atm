-- ─────────────────────────────────────────────────────────────────────────────
-- Remove the TEMP-xxx test employees created by the bulk import.
--
-- These were seeded with placeholder phone numbers (TEMP-001 … TEMP-100) and
-- cannot log in. This deletes them and every row that references them.
--
-- Run in the Turso dashboard SQL editor, or:
--   turso db shell <your-db-name> < scripts/delete-temp-employees.sql
--
-- SAFETY: every statement is scoped to phone LIKE 'TEMP-%'. Real employees
-- with genuine phone numbers are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- Check first — run this alone to see exactly what will be removed:
--   SELECT id, name, phone FROM employees WHERE phone LIKE 'TEMP-%';

-- Child rows (must go before the employees rows they reference)
DELETE FROM attendance                 WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM attendance_corrections     WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM leave_requests             WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM leave_balances             WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM transactions               WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM advance_requests           WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM advance_schedules          WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM complaints                 WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM payslips                   WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM service_certificates       WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM overtime_entries           WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM employee_status_events     WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');
DELETE FROM employee_transfer_history  WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');

-- Login accounts (matched both ways in case a user row was orphaned)
DELETE FROM users WHERE phone LIKE 'TEMP-%';
DELETE FROM users WHERE employee_id IN (SELECT id FROM employees WHERE phone LIKE 'TEMP-%');

-- Finally the employees themselves
DELETE FROM employees WHERE phone LIKE 'TEMP-%';

-- Verify — should return 0:
--   SELECT COUNT(*) FROM employees WHERE phone LIKE 'TEMP-%';
