import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "trusttrack-sms-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, "test.db")}`;
delete process.env.SWALA_API_KEY;
delete process.env.SWALA_SENDER_ID;

type SmsModule = typeof import("./sms");

let sms: SmsModule;
const originalFetch = globalThis.fetch;

test.before(async () => {
  sms = await import("./sms");
  const { db } = await import("./db");
  await db.execute(`CREATE TABLE IF NOT EXISTS sms_queue (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME
    )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS sms_log (
      id TEXT PRIMARY KEY,
      recipient_phone TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_by TEXT,
      source TEXT,
      status TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SWALA_API_KEY;
  delete process.env.SWALA_SENDER_ID;
});

test("formats Tanzania numbers as +255...", () => {
  assert.equal(sms.toE164Tanzania("+255712345678"), "+255712345678");
  assert.equal(sms.toE164Tanzania("255712345678"), "+255712345678");
  assert.equal(sms.toE164Tanzania("0712345678"), "+255712345678");
  assert.equal(sms.toE164Tanzania("+255 712 345 678"), "+255712345678");
  assert.equal(sms.toE164Tanzania("255-712-345-678"), "+255712345678");
  assert.equal(sms.toE164Tanzania("   "), "");
});

test("missing SWALA_API_KEY does not throw", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };

  const result = await sms.sendSMS("0712345678", "Habari");
  assert.equal(result.success, false);
  assert.equal(result.queued, true);
  assert.match(result.error ?? "", /SWALA_API_KEY is not set/);
  assert.equal(called, false);

  const { db } = await import("./db");
  const queued = await db.execute(
    "SELECT phone, status FROM sms_queue WHERE phone = '+255712345678'"
  );
  assert.ok(queued.rows.length >= 1);
  assert.equal(queued.rows[0].status, "pending");
});

test("missing SWALA_SENDER_ID does not throw", async () => {
  process.env.SWALA_API_KEY = "swl_test_example";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };

  const result = await sms.sendSMS("255712345678", "Habari");
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /SWALA_SENDER_ID is not set/);
  assert.equal(called, false);
});

test("sends through Swala with bearer auth and E.164 recipient", async () => {
  process.env.SWALA_API_KEY = "swl_test_example";
  process.env.SWALA_SENDER_ID = "POSTSMS";

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: { uid: "msg-1", status: "queued" },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await sms.sendSMS("0712345678", "Habari");
  assert.equal(result.success, true);
  assert.equal(result.messageId, "msg-1");
  assert.equal(result.statusCode, 202);
  assert.equal(capturedUrl, sms.SWALA_SMS_URL);

  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer swl_test_example");
  assert.equal(headers["Content-Type"], "application/json");
  assert.ok(headers["Idempotency-Key"]);

  const body = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(body, {
    recipient: "+255712345678",
    sender_id: "POSTSMS",
    body: "Habari",
  });
});
