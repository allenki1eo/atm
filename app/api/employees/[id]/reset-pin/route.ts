import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { sendSMS } from "@/lib/at";
import bcrypt from "bcryptjs";
import { apiHandler } from "@/lib/api-handler";

function generatePIN(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getEmployeeUser(id: string) {
  const res = await db.execute({
    sql: `SELECT e.id, e.name, e.phone, u.id as user_id, u.plain_pin
          FROM employees e
          LEFT JOIN users u ON u.employee_id = e.id
          WHERE e.id = ?`,
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return res.rows[0] as unknown as {
    id: string; name: string; phone: string;
    user_id: string | null; plain_pin: string | null;
  };
}

// GET — return current stored PIN (if available)
async function _GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  await ensureDatabase();
  const { id } = await params;
  const emp = await getEmployeeUser(id);
  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    name: emp.name,
    phone: emp.phone,
    pin: emp.plain_pin ?? null,
  });
}

// POST — generate a new PIN, store it, optionally resend SMS
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  await ensureDatabase();
  const { id } = await params;
  const emp = await getEmployeeUser(id);
  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!emp.user_id) return NextResponse.json({ error: "No user account linked" }, { status: 400 });

  const pin = generatePIN();
  const hash = await bcrypt.hash(pin, 10);

  await db.execute({
    sql: "UPDATE users SET password_hash = ?, plain_pin = ? WHERE id = ?",
    args: [hash, pin, emp.user_id],
  });

  const body = await request.json().catch(() => ({})) as { sendSms?: boolean };
  let smsSent = false;

  if (body.sendSms) {
    const message =
      `TrustTrack: Hujambo ${emp.name}! PIN yako mpya: ${pin}. ` +
      `Ingia kwa nambari: ${emp.phone}. Usishiriki PIN hii. ` +
      `Ingia: https://atwork.eastafricanspirit.co.tz/login`;
    const result = await sendSMS(emp.phone, message, {
      sentBy: session.user.id ?? null,
      source: "pin_reset",
    });
    smsSent = result.success;
  }

  return NextResponse.json({ pin, smsSent });
}

export const GET = apiHandler(_GET);
export const POST = apiHandler(_POST);
