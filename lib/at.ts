import { db } from "@/lib/db";
import { nanoid } from "nanoid";

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(phone: string, message: string): Promise<SMSResult> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME ?? "sandbox";
  const senderId = process.env.AT_SENDER_ID;

  if (!apiKey) {
    console.warn("Africa's Talking API key not set, queueing SMS");
    await queueSMS(phone, message);
    return { success: false, error: "API key not configured" };
  }

  const baseUrl =
    username === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

  try {
    const body = new URLSearchParams({
      username,
      to: phone,
      message,
      ...(senderId ? { from: senderId } : {}),
    });

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const recipient = data.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === "Success") {
      return { success: true, messageId: recipient.messageId };
    } else {
      throw new Error(recipient?.status ?? "Unknown error");
    }
  } catch (error) {
    console.error("SMS send error:", error);
    await queueSMS(phone, message);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function queueSMS(phone: string, message: string) {
  await db.execute({
    sql: "INSERT INTO sms_queue (id, phone, message, status) VALUES (?, ?, ?, 'pending')",
    args: [nanoid(), phone, message],
  });
}

export async function processSmSQueue() {
  const pending = await db.execute(
    "SELECT * FROM sms_queue WHERE status = 'pending' AND attempts < 3"
  );

  for (const row of pending.rows) {
    const sms = row as unknown as { id: string; phone: string; message: string; attempts: number };
    const result = await sendSMS(sms.phone, sms.message);

    if (result.success) {
      await db.execute({
        sql: "UPDATE sms_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [sms.id],
      });
    } else {
      await db.execute({
        sql: "UPDATE sms_queue SET attempts = attempts + 1, status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END WHERE id = ?",
        args: [sms.id],
      });
    }
  }
}

// SMS message templates
export const smsTemplates = {
  attendanceMarked: (name: string, status: string, date: string, daysTotal: number, net: string) =>
    `TrustTrack: ${status} recorded for ${date}. Month total: ${daysTotal} days. Balance: ${net}`,

  payrollReady: (month: string, days: number, rate: string, gross: string, deadline: string) =>
    `${month} payroll ready: ${days} days x ${rate}/day = ${gross}. Disputes? Visit HR by ${deadline}`,

  advanceApproved: (amount: string, newBalance: string) =>
    `TrustTrack: Advance of ${amount} approved. New balance: ${newBalance}`,

  periodLocked: (month: string) =>
    `TrustTrack: Attendance for ${month} is now locked. Check your dashboard for details.`,
};
