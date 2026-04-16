import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendSMS } from "@/lib/at";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "hr" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { phone, message } = body;

  if (!phone || !message) {
    return NextResponse.json({ error: "Phone and message required" }, { status: 400 });
  }

  const result = await sendSMS(phone, message);
  return NextResponse.json(result);
}
