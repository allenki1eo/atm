import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  if (!employeeId) {
    return NextResponse.json({ error: "Missing employee_id" }, { status: 400 });
  }

  const employeeRes = await db.execute({
    sql: "SELECT id, name, active FROM employees WHERE id = ?",
    args: [employeeId],
  });
  if (employeeRes.rows.length === 0) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const statusRes = await db.execute({
    sql: `SELECT ese.*, u.name AS changed_by_name
          FROM employee_status_events ese
          LEFT JOIN users u ON u.id = ese.changed_by
          WHERE ese.employee_id = ?
          ORDER BY ese.changed_at DESC`,
    args: [employeeId],
  });

  const transfersRes = await db.execute({
    sql: `SELECT eth.*,
            fc.name AS from_company_name,
            fs.name AS from_section_name,
            tc.name AS to_company_name,
            ts.name AS to_section_name,
            u.name AS changed_by_name
          FROM employee_transfer_history eth
          LEFT JOIN companies fc ON fc.id = eth.from_company_id
          LEFT JOIN sections fs ON fs.id = eth.from_section_id
          LEFT JOIN companies tc ON tc.id = eth.to_company_id
          LEFT JOIN sections ts ON ts.id = eth.to_section_id
          LEFT JOIN users u ON u.id = eth.changed_by
          WHERE eth.employee_id = ?
          ORDER BY eth.changed_at DESC`,
    args: [employeeId],
  });

  return NextResponse.json({
    employee: employeeRes.rows[0],
    status_events: statusRes.rows,
    transfers: transfersRes.rows,
  });
}
