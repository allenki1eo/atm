import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

/** Single-message send endpoint. Docs: https://docs.swalasms.com/ */
export const SWALA_SMS_URL = "https://api.swalasms.com/v1/sms/messages";

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

type SwalaSendResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  error_code?: string;
  request_uid?: string;
  data?: {
    uid?: string;
    status?: string;
  };
};

export function getSwalaConfig(): { apiKey: string; senderId: string } {
  return {
    apiKey: process.env.SWALA_API_KEY?.trim() ?? "",
    senderId: process.env.SWALA_SENDER_ID?.trim() ?? "",
  };
}

/** live keys start swl_live_; sandbox keys start swl_test_ and do not deliver. */
export function swalaKeyMode(apiKey: string): "live" | "sandbox" | "unknown" {
  if (apiKey.startsWith("swl_live_")) return "live";
  if (apiKey.startsWith("swl_test_")) return "sandbox";
  return "unknown";
}

/**
 * Tanzania numbers to E.164 (+255...).
 * Accepts +255..., 255..., and local 0... forms, with spaces or dashes.
 */
export function toE164Tanzania(phone: string): string {
  const compact = phone.trim().replace(/[\s\-()]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `+255${digits.slice(1)}`;
  if (digits.startsWith("255")) return `+${digits}`;
  return `+${digits}`;
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

async function failGracefully(
  phone: string,
  message: string,
  error: string,
  options?: SMSOptions
): Promise<SMSResult> {
  console.warn(`[SMS] ${error}`);
  await queueSMS(phone, message);
  await logSMS(phone, message, "queued", error, options);
  return { success: false, error, queued: true };
}

/**
 * Send an SMS via the Swala SMS API.
 *
 * Environment variables:
 *   SWALA_API_KEY   — bearer token from the SwalaSMS dashboard (never commit this)
 *   SWALA_SENDER_ID — approved sender ID on that account (example: POSTSMS)
 *
 * If either value is missing, the send is skipped, logged, and queued. Callers
 * never see a thrown error.
 */
export async function sendSMS(
  phone: string,
  message: string,
  options?: SMSOptions
): Promise<SMSResult> {
  const recipient = toE164Tanzania(phone);
  if (!recipient) {
    const error = "Phone number is empty";
    console.warn(`[SMS] ${error}`);
    await logSMS(phone, message, "failed", error, options);
    return { success: false, error };
  }

  const { apiKey, senderId } = getSwalaConfig();
  if (!apiKey) {
    return failGracefully(
      recipient,
      message,
      "SWALA_API_KEY is not set — SMS was not sent. Add SWALA_API_KEY in the environment.",
      options
    );
  }
  if (!senderId) {
    return failGracefully(
      recipient,
      message,
      "SWALA_SENDER_ID is not set — SMS was not sent. Set it to an approved Swala sender ID (for example POSTSMS).",
      options
    );
  }

  console.log(`[SMS] Sending to ${recipient} via Swala (sender: ${senderId})`);

  try {
    const response = await fetch(SWALA_SMS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        recipient,
        sender_id: senderId,
        body: message,
      }),
    });

    const rawText = await response.text();
    let data: SwalaSendResponse = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as SwalaSendResponse;
      } catch {
        data = {};
      }
    }

    const messageId = data.data?.uid ?? data.request_uid;
    if (response.ok && data.success !== false) {
      console.log(
        `[SMS] Accepted by Swala — status ${response.status}, messageId: ${messageId ?? "(none)"}`
      );
      await logSMS(recipient, message, "sent", null, options);
      return {
        success: true,
        messageId,
        statusCode: response.status,
        rawStatus: data.data?.status,
      };
    }

    const detail =
      data.message ||
      data.error ||
      (rawText ? rawText.slice(0, 300) : "empty response");
    throw new Error(
      `Swala HTTP ${response.status}${data.error_code ? ` ${data.error_code}` : ""}: ${detail}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[SMS] Failed to send to ${recipient}:`, msg);
    await queueSMS(recipient, message);
    await logSMS(recipient, message, "failed", msg, options);
    return { success: false, error: msg, queued: true };
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
