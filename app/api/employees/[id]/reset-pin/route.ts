import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { sendSMS } from "@/lib/at";
import bcrypt from "bcryptjs";

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await ensureDatabase();
  const { id } = await params;

  // Get employee + linked user
  const empRes = await db.execute({
    sql: `SELECT e.id, e.name, e.phone, u.id as user_id
          FROM employees e
          LEFT JOIN users u ON u.employee_id = e.id
          WHERE e.id = ?`,
    args: [id],
  });

  if (empRes.rows.length === 0) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const emp = empRes.rows[0] as unknown as {
    id: string;
    name: string;
    phone: string;
    user_id: string | null;
  };

  if (!emp.user_id) {
    return NextResponse.json({ error: "No user account linked to this employee" }, { status: 400 });
  }

  const pin = generatePIN();
  const hash = await bcrypt.hash(pin, 10);

  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [hash, emp.user_id],
  });

  // Optionally resend SMS
  const body = await request.json().catch(() => ({})) as { sendSms?: boolean };
  let smsSent = false;

  if (body.sendSms) {
    const message =
      `TrustTrack: Hujambo ${emp.name}! PIN yako mpya: ${pin}. ` +
      `Ingia kwa nambari: ${emp.phone}. ` +
      `Usishiriki PIN hii. ` +
      `Ingia: https://atwork.eastafricanspirit.co.tz/login`;
    const result = await sendSMS(emp.phone, message, {
      sentBy: session.user.id ?? null,
      source: "pin_reset",
    });
    smsSent = result.success;
  }

  return NextResponse.json({ pin, smsSent });
}
