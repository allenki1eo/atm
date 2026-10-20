import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SWALA_SMS_URL, getSwalaConfig, sendSMS, swalaKeyMode } from "@/lib/sms";

/**
 * Admin-only test endpoint to verify Swala SMS is working.
 *
 * POST /api/test-sms
 * Body (optional): { "phone": "+255712345678", "message": "custom message" }
 *
 * Returns diagnostics (never the API key) and the Swala send result.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const phone: string = body.phone ?? "+255712345678";
  const message: string =
    body.message ??
    "TrustTrack majaribio ya SMS: Ujumbe huu ni wa kujaribu mfumo. Kama umepokea, SMS inafanya kazi vizuri!";

  const { apiKey, senderId } = getSwalaConfig();
  const mode = apiKey ? swalaKeyMode(apiKey) : "missing";

  const config = {
    provider: "Swala SMS",
    hasApiKey: apiKey.length > 0,
    keyMode: mode,
    senderId: senderId || "(not set)",
    endpoint: SWALA_SMS_URL,
  };

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "SWALA_API_KEY is not set in environment variables",
      config,
      fix: "Add SWALA_API_KEY and SWALA_SENDER_ID to your Vercel environment variables and redeploy",
    }, { status: 400 });
  }

  if (!senderId) {
    return NextResponse.json({
      success: false,
      error: "SWALA_SENDER_ID is not set in environment variables",
      config,
      fix: "Set SWALA_SENDER_ID to an approved Swala sender ID (for example POSTSMS) and redeploy",
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
    tip: mode === "sandbox"
      ? "This key is a Swala sandbox key (swl_test_). Messages are not delivered to real phones. Use a live key (swl_live_) to send."
      : null,
  });
}
