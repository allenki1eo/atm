import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS } from "@/lib/at";

/**
 * GET — Returns announcements visible to the current user, with a
 * computed `is_read` flag derived from announcement_reads.
 *
 * Employees see only announcements whose audience matches their
 * company/section/role or is broadcast to "all". HR/Admin see everything.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;
  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";

  // Look up the employee row (if any) for audience targeting.
  const userResult = await db.execute({
    sql: "SELECT employee_id FROM users WHERE id = ?",
    args: [userId],
  });
  const userRow = userResult.rows[0] as unknown as { employee_id: string | null } | undefined;
  const employeeId = userRow?.employee_id ?? null;

  let companyId: string | null = null;
  let sectionId: string | null = null;
  if (employeeId) {
    const empResult = await db.execute({
      sql: "SELECT company_id, section_id FROM employees WHERE id = ?",
      args: [employeeId],
    });
    const emp = empResult.rows[0] as unknown as { company_id: string | null; section_id: string | null } | undefined;
    companyId = emp?.company_id ?? null;
    sectionId = emp?.section_id ?? null;
  }

  let sql: string;
  let args: (string | null)[];

  if (role === "hr" || role === "admin") {
    sql = `SELECT a.*, u.name as author_name,
              EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) as is_read
           FROM announcements a
           LEFT JOIN users u ON u.id = a.created_by
           ORDER BY a.created_at DESC`;
    args = [userId];
  } else {
    sql = `SELECT a.*, u.name as author_name,
              EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) as is_read
           FROM announcements a
           LEFT JOIN users u ON u.id = a.created_by
           WHERE a.audience_type = 'all'
              OR (a.audience_type = 'role' AND a.audience_id = ?)
              OR (a.audience_type = 'company' AND a.audience_id = ?)
              OR (a.audience_type = 'section' AND a.audience_id = ?)
              OR (a.audience_type = 'employee' AND a.audience_id = ?)
           ORDER BY a.created_at DESC`;
    args = [userId, role, companyId, sectionId, employeeId];
  }

  const result = await db.execute({ sql, args });
  const rows = result.rows as unknown as { is_read: number }[];
  const filtered = unreadOnly ? rows.filter((r) => !r.is_read) : rows;
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden: HR or admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { subject, message, audience_type, audience_id, send_sms } = body;

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message required" }, { status: 400 });
  }
  if (!["all", "company", "section", "role", "employee"].includes(audience_type)) {
    return NextResponse.json({ error: "Invalid audience_type" }, { status: 400 });
  }
  if (audience_type !== "all" && !audience_id) {
    return NextResponse.json({ error: "audience_id required for this audience_type" }, { status: 400 });
  }

  const id = nanoid();
  await db.execute({
    sql: `INSERT INTO announcements (id, subject, message, audience_type, audience_id, send_sms, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      subject.trim(),
      message.trim(),
      audience_type,
      audience_type === "all" ? null : audience_id,
      send_sms ? 1 : 0,
      session.user.id!,
    ],
  });

  let smsQueued = 0;
  if (send_sms) {
    // Resolve recipient phones from employees matching the audience.
    let empSql = "SELECT phone FROM employees WHERE active = 1 AND phone IS NOT NULL AND phone != ''";
    const empArgs: string[] = [];
    if (audience_type === "company") {
      empSql += " AND company_id = ?";
      empArgs.push(audience_id);
    } else if (audience_type === "section") {
      empSql += " AND section_id = ?";
      empArgs.push(audience_id);
    } else if (audience_type === "role") {
      empSql = "SELECT phone FROM users WHERE role = ? AND phone IS NOT NULL AND phone != ''";
      empArgs.push(audience_id);
    } else if (audience_type === "employee") {
      empSql += " AND id = ?";
      empArgs.push(audience_id);
    }

    const recipients = await db.execute({ sql: empSql, args: empArgs });
    const smsText = `${subject.trim()}: ${message.trim()}`.slice(0, 320);

    for (const r of recipients.rows as unknown as { phone: string }[]) {
      if (r.phone) {
        await sendSMS(r.phone, smsText, {
          sentBy: session.user.id ?? null,
          source: "announcement",
        });
        smsQueued++;
      }
    }
  }

  const result = await db.execute({
    sql: "SELECT * FROM announcements WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ ...result.rows[0], sms_queued: smsQueued }, { status: 201 });
}
