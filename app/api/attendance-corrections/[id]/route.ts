import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { apiHandler } from "@/lib/api-handler";

const STATUS_LABEL_SW: Record<string, string> = {
  present: "Alikuwepo",
  absent: "Hakuwepo",
  late: "Alichelewa",
  half_day: "Nusu siku",
};

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();

  const role = (session.user as { role: string }).role;
  if (role !== "supervisor" && role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, review_note } = body as { status?: string; review_note?: string };

  if (!status || !["approved", "denied"].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'approved' or 'denied'" },
      { status: 400 }
    );
  }

  const existing = await db.execute({
    sql: `SELECT ac.*, e.supervisor_id, e.section_id, e.phone, e.name
          FROM attendance_corrections ac
          JOIN employees e ON e.id = ac.employee_id
          WHERE ac.id = ?`,
    args: [id],
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Ombi halipo" }, { status: 404 });
  }
  const row = existing.rows[0] as unknown as {
    id: string;
    employee_id: string;
    date: string;
    original_attendance_id: string | null;
    original_status: string | null;
    requested_status: string;
    status: string;
    supervisor_id: string | null;
    section_id: string | null;
    phone: string | null;
    name: string;
  };

  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `Ombi tayari lina hali '${row.status}'` },
      { status: 400 }
    );
  }

  // Supervisor scope check
  if (role === "supervisor") {
    const reviewerId = session.user.id!;
    if (row.supervisor_id !== reviewerId) {
      const sec = await db.execute({
        sql: `SELECT 1 FROM supervisor_sections
              WHERE supervisor_id = ? AND section_id = ?`,
        args: [reviewerId, row.section_id ?? ""],
      });
      if (sec.rows.length === 0) {
        return NextResponse.json(
          { error: "Huwezi kupitia ombi la mfanyakazi huyu" },
          { status: 403 }
        );
      }
    }
  }

  let appliedAttendanceId: string | null = null;

  if (status === "approved") {
    // Re-check lock state at approval time to avoid a race with payroll lock
    const attCheck = await db.execute({
      sql: "SELECT id, is_locked FROM attendance WHERE employee_id = ? AND date = ?",
      args: [row.employee_id, row.date],
    });
    const attRow = attCheck.rows[0] as unknown as
      | { id: string; is_locked: number }
      | undefined;

    if (attRow?.is_locked) {
      return NextResponse.json(
        { error: "Mahudhurio ya tarehe hii yamefungwa — huwezi kuyarekebisha" },
        { status: 403 }
      );
    }

    if (attRow) {
      await db.execute({
        sql: `UPDATE attendance
              SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP,
                  notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' | ' END || 'Imerekebishwa kupitia ombi'
              WHERE id = ?`,
        args: [row.requested_status, session.user.id!, attRow.id],
      });
      appliedAttendanceId = attRow.id;
    } else {
      appliedAttendanceId = nanoid();
      await db.execute({
        sql: `INSERT INTO attendance (id, employee_id, date, status, marked_by, notes)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          appliedAttendanceId,
          row.employee_id,
          row.date,
          row.requested_status,
          session.user.id!,
          "Imeongezwa kupitia ombi la marekebisho",
        ],
      });
    }
  }

  await db.execute({
    sql: `UPDATE attendance_corrections
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?, applied_attendance_id = ?
          WHERE id = ?`,
    args: [status, session.user.id!, review_note ?? null, appliedAttendanceId, id],
  });

  // Notify employee
  if (row.phone) {
    const message =
      status === "approved"
        ? smsTemplates.correctionApproved(
            row.date,
            STATUS_LABEL_SW[row.requested_status] ?? row.requested_status
          )
        : smsTemplates.correctionDenied(row.date, review_note);
    sendSMS(row.phone, message, {
      sentBy: session.user.id ?? null,
      source: status === "approved" ? "correction_approved" : "correction_denied",
    }).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    id,
    status,
    applied_attendance_id: appliedAttendanceId,
  });
}

export const PUT = apiHandler(_PUT);
