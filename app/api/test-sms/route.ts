import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendSMS } from "@/lib/at";
import { apiHandler } from "@/lib/api-handler";

/**
 * Admin-only test endpoint to verify Africa's Talking SMS is working.
 *
 * POST /api/test-sms
 * Body (optional): { "phone": "+255750731364", "message": "custom message" }
 *
 * Returns full diagnostics including env var status and AT raw response.
 */
async function _POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const phone: string = body.phone ?? "+255750731364";
  const message: string =
    body.message ??
    "TrustTrack majaribio ya SMS: Ujumbe huu ni wa kujaribu mfumo. Kama umepokea, SMS inafanya kazi vizuri!";

  // Show env config in response (mask the API key)
  const apiKey = process.env.AT_API_KEY?.trim() ?? "";
  const username = process.env.AT_USERNAME?.trim() ?? "(not set)";
  const senderId = process.env.AT_SENDER_ID?.trim() ?? "(not set)";
  const isSandbox = username.toLowerCase() === "sandbox";

  const config = {
    hasApiKey: apiKey.length > 0,
    apiKeyPreview: apiKey.length > 4 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "(empty)",
    username,
    senderId,
    mode: isSandbox ? "SANDBOX (messages NOT delivered to real phones)" : "LIVE",
    endpoint: isSandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging",
  };

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "AT_API_KEY is not set in environment variables",
      config,
      fix: "Add AT_API_KEY to your Vercel environment variables and redeploy",
    }, { status: 400 });
  }

  const result = await sendSMS(phone, message, {
    sentBy: session.user.id ?? null,
    source: "test_sms",
  });

  return NextResponse.json({
    ...result,
    phone,
    message,
    config,
    tip: isSandbox
      ? "You are in SANDBOX mode. Messages will not reach real phones. Change AT_USERNAME to 'GAKISMS' and use your live API key."
      : null,
  });
}

export const POST = apiHandler(_POST);
