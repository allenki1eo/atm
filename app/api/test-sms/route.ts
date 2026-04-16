import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendSMS } from "@/lib/at";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const phone: string = body.phone ?? "+255750731364";
  const message: string = body.message ?? "TrustTrack majaribio ya SMS: Ujumbe huu ni wa kujaribu mfumo wa SMS. Kama umepokea, mfumo unafanya kazi vizuri!";

  console.log(`[test-sms] Sending to ${phone}: ${message}`);

  const result = await sendSMS(phone, message);

  return NextResponse.json({
    phone,
    message,
    ...result,
    env: {
      hasApiKey: !!process.env.AT_API_KEY,
      username: process.env.AT_USERNAME ?? "(not set)",
      senderId: process.env.AT_SENDER_ID ?? "(not set)",
    },
  });
}
