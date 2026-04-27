import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { nanoid } from "nanoid";
import { sendSMS, smsTemplates } from "@/lib/at";
import { formatCurrency } from "@/lib/utils";

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
  const { status, review_note, monthly_deduction } = body as {
    status?: string;
    review_note?: string;
    monthly_deduction?: number;
  };

  if (!status || !["approved", "denied"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'denied'" }, { status: 400 });
  }

  const existing = await db.execute({
    sql: "SELECT * FROM advance_requests WHERE id = ?",
    args: [id],
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Advance request not found" }, { status: 404 });
  }
  const req = existing.rows[0] as unknown as {
    employee_id: string;
    amount: number;
    status: string;
  };
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot review a request already '${req.status}'` },
      { status: 400 }
    );
  }

  let transactionId: string | null = null;
  if (status === "approved") {
    transactionId = nanoid();
    const deduction = Math.max(
      1,
      Math.min(Math.abs(req.amount), Math.round(monthly_deduction || req.amount))
    );
    // advance_given is negative in the ledger (employee now owes company)
    await db.execute({
      sql: `INSERT INTO transactions (id, employee_id, type, amount, description, created_by)
            VALUES (?, ?, 'advance_given', ?, ?, ?)`,
      args: [
        transactionId,
        req.employee_id,
        -Math.abs(req.amount),
        review_note ?? "Advance approved",
        session.user.id!,
      ],
    });
    await db.execute({
      sql: `INSERT INTO advance_schedules
            (id, employee_id, total_debt, monthly_deduction, remaining_debt, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nanoid(),
        req.employee_id,
        Math.abs(req.amount),
        deduction,
        Math.abs(req.amount),
        review_note ?? "Approved salary advance repayment plan",
        session.user.id!,
      ],
    });
  }

  await db.execute({
    sql: `UPDATE advance_requests
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?, transaction_id = ?
          WHERE id = ?`,
    args: [status, session.user.id!, review_note ?? null, transactionId, id],
  });

  // Notify employee
  const empRes = await db.execute({
    sql: "SELECT name, phone FROM employees WHERE id = ?",
    args: [req.employee_id],
  });
  const emp = empRes.rows[0] as unknown as { name: string; phone: string | null } | undefined;
  if (emp?.phone) {
    if (status === "approved") {
      const balRes = await db.execute({
        sql: "SELECT SUM(amount) as total FROM transactions WHERE employee_id = ?",
        args: [req.employee_id],
      });
      const newBalance = (balRes.rows[0] as unknown as { total: number }).total ?? 0;
      const msg = smsTemplates.advanceApproved(
        formatCurrency(Math.abs(req.amount)),
        formatCurrency(newBalance)
      );
      await sendSMS(emp.phone, msg, {
        sentBy: session.user.id ?? null,
        source: "advance_approved",
      });
    } else {
      const msg = `TrustTrack: Ombi lako la mkopo limekataliwa.${review_note ? ` Sababu: ${review_note}` : ""}`;
      await sendSMS(emp.phone, msg, {
        sentBy: session.user.id ?? null,
        source: "advance_denied",
      });
    }
  }

  return NextResponse.json({ success: true, id, status, transaction_id: transactionId });
}
