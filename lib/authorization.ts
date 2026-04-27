import { db } from "@/lib/db";

export function isAdminOrHr(role: string) {
  return role === "admin" || role === "hr";
}

export async function getLinkedEmployeeId(userId: string) {
  const result = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as unknown as
    | { employee_id: string | null }
    | undefined;
  return row?.employee_id ?? null;
}

export async function supervisorCanAccessEmployee(
  supervisorId: string,
  employeeId: string
) {
  const result = await db.execute({
    sql: `SELECT 1
          FROM employees e
          WHERE e.id = ?
            AND (
              e.supervisor_id = ?
              OR e.section_id IN (
                SELECT section_id
                FROM supervisor_sections
                WHERE supervisor_id = ?
              )
            )`,
    args: [employeeId, supervisorId, supervisorId],
  });

  return result.rows.length > 0;
}
