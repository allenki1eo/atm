import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { sendSMS } from "@/lib/at";

const VALID_STATUSES = ["received", "in_review", "awaiting_employee", "closed"] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden: HR or admin only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { response, status } = body;

  if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid complaint status" }, { status: 400 });
  }

  const nextStatus = status ?? (response?.trim() ? "awaiting_employee" : "in_review");

  await db.execute({
    sql: `UPDATE complaints
          SET response = COALESCE(?, response),
              status = ?,
              responded_by = CASE WHEN ? IS NULL THEN responded_by ELSE ? END,
              responded_at = CASE WHEN ? IS NULL THEN responded_at ELSE CURRENT_TIMESTAMP END
          WHERE id = ?`,
    args: [
      response?.trim() || null,
      nextStatus,
      response?.trim() || null,
      session.user.id!,
      response?.trim() || null,
      id,
    ],
  });

  // SMS the employee that HR has responded
  const complaint = await db.execute({
    sql: `SELECT c.subject, e.phone, e.name
          FROM complaints c
          JOIN employees e ON e.id = c.employee_id
          WHERE c.id = ?`,
    args: [id],
  });
  const row = complaint.rows[0] as unknown as { subject: string; phone: string; name: string } | undefined;
  if (response?.trim() && row?.phone) {
    const msg = `TrustTrack: HR amejibu malalamiko yako "${row.subject}". Tafadhali ingia mfumoni kusoma jibu.`;
    await sendSMS(row.phone, msg, {
      sentBy: session.user.id ?? null,
      source: "complaint_response",
    });
  }

  const result = await db.execute({
    sql: `SELECT c.*, e.name as employee_name, e.phone as employee_phone
          FROM complaints c
          JOIN employees e ON e.id = c.employee_id
          WHERE c.id = ?`,
    args: [id],
  });
  return NextResponse.json(result.rows[0]);
}
