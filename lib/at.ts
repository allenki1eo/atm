import { db } from "@/lib/db";
import { nanoid } from "nanoid";

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
  rawStatus?: string;
  queued?: boolean;
}

export interface SMSOptions {
  /** User id who initiated the send (nullable for system-triggered). */
  sentBy?: string | null;
  /** Feature source, e.g. "announcement", "leave_decision", "advance_request". */
  source?: string | null;
}

async function logSMS(
  phone: string,
  message: string,
  status: string,
  error: string | null,
  options?: SMSOptions
) {
  try {
    await db.execute({
      sql: `INSERT INTO sms_log (id, recipient_phone, message, sent_by, source, status, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nanoid(),
        phone,
        message,
        options?.sentBy ?? null,
        options?.source ?? null,
        status,
        error,
      ],
    });
  } catch (e) {
    console.error("[SMS] Failed to audit-log message:", e);
  }
}

/**
 * Send an SMS via Africa's Talking REST API.
 *
 * Environment variables:
 *   AT_API_KEY   — production or sandbox API key (from AT dashboard → API Key)
 *   AT_USERNAME  — your AT username e.g. "GAKISMS"  (NOT "sandbox" for real sends)
 *   AT_SENDER_ID — optional registered alphanumeric sender ID; omit if not registered
 *
 * If AT_API_KEY is missing the message is queued in the DB for later retry.
 */
export async function sendSMS(
  phone: string,
  message: string,
  options?: SMSOptions
): Promise<SMSResult> {
  const apiKey = process.env.AT_API_KEY?.trim();
  const username = (process.env.AT_USERNAME ?? "sandbox").trim();
  const senderId = process.env.AT_SENDER_ID?.trim();

  if (!apiKey) {
    console.warn("[SMS] AT_API_KEY not set — queuing message for later");
    await queueSMS(phone, message);
    await logSMS(phone, message, "queued", "AT_API_KEY not configured", options);
    return { success: false, error: "AT_API_KEY not configured", queued: true };
  }

  // Africa's Talking: sandbox username → sandbox URL, any other username → live URL
  const isSandbox = username.toLowerCase() === "sandbox";
  const url = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  // Normalize phone: AT expects international format with +
  const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`;

  const params = new URLSearchParams({
    username,
    to: normalizedPhone,
    message,
  });
  // Only include sender ID if explicitly configured — unregistered IDs cause rejection
  if (senderId) params.set("from", senderId);

  console.log(`[SMS] Sending to ${normalizedPhone} via ${isSandbox ? "SANDBOX" : "LIVE"} (username: ${username})`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const rawText = await response.text();
    console.log(`[SMS] AT response ${response.status}:`, rawText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${rawText}`);
    }

    let data: { SMSMessageData?: { Recipients?: { status: string; statusCode: number; messageId: string }[] } };
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Non-JSON response: ${rawText}`);
    }

    const recipient = data.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === "Success") {
      console.log(`[SMS] Delivered — messageId: ${recipient.messageId}`);
      await logSMS(phone, message, "sent", null, options);
      return { success: true, messageId: recipient.messageId, statusCode: recipient.statusCode };
    }

    // Some networks return "Sent" as status
    if (recipient?.statusCode === 101 || recipient?.status === "Sent") {
      await logSMS(phone, message, "sent", null, options);
      return { success: true, messageId: recipient.messageId, statusCode: recipient.statusCode };
    }

    throw new Error(`AT status: ${recipient?.status ?? "no recipient in response"} (code ${recipient?.statusCode ?? "?"})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[SMS] Failed to send to ${normalizedPhone}:`, msg);
    await queueSMS(phone, message);
    await logSMS(phone, message, "failed", msg, options);
    return { success: false, error: msg, queued: true };
  }
}

async function queueSMS(phone: string, message: string) {
  try {
    await db.execute({
      sql: "INSERT INTO sms_queue (id, phone, message, status) VALUES (?, ?, ?, 'pending')",
      args: [nanoid(), phone, message],
    });
  } catch (e) {
    console.error("[SMS] Failed to queue message:", e);
  }
}

export async function processSMSQueue() {
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
        sql: `UPDATE sms_queue
              SET attempts = attempts + 1,
                  status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END
              WHERE id = ?`,
        args: [sms.id],
      });
    }
  }
}

// SMS templates — Swahili
export const smsTemplates = {
  attendanceMarked: (name: string, status: string, date: string, daysTotal: number, net: string) =>
    `TrustTrack: Hali yako (${status}) imewekwa tarehe ${date}. Siku za kazi mwezi huu: ${daysTotal}. Bakaa: ${net}`,

  payrollReady: (month: string, days: number, rate: string, gross: string, deadline: string) =>
    `${month}: Umefanya kazi siku ${days} x ${rate}/siku = ${gross}. Maswali? Tembelea HR kabla ya ${deadline}`,

  advanceApproved: (amount: string, newBalance: string) =>
    `TrustTrack: Mkopo wa ${amount} umeidhinishwa. Bakaa mpya: ${newBalance}`,

  periodLocked: (month: string) =>
    `TrustTrack: Mahudhurio ya ${month} yamefungwa. Angalia dashibodi yako kwa maelezo.`,

  advanceRequested: (amount: string) =>
    `TrustTrack: Ombi lako la mkopo wa ${amount} limepokelewa. Utaarifiwa ukikubaliwa.`,

  newEmployeeCredentials: (name: string, phone: string, pin: string) =>
    `Karibu TrustTrack! Jina: ${name}. Ingia kwa nambari yako: ${phone}. PIN ya siri: ${pin}. Usishiriki PIN hii. Ingia hapa: https://atwork.eastafricanspirit.co.tz/login`,

  correctionApproved: (date: string, status: string) =>
    `TrustTrack: Marekebisho ya mahudhurio yako ya tarehe ${date} yamekubaliwa. Hali mpya: ${status}.`,

  correctionDenied: (date: string, note?: string) =>
    `TrustTrack: Marekebisho ya mahudhurio ya tarehe ${date} yamekataliwa.${note ? ` Sababu: ${note}` : ""}`,
};
