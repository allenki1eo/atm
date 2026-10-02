import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SignJWT, generateKeyPair } from "jose";

const dir = mkdtempSync(path.join(tmpdir(), "trusttrack-sso-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.SSO_SHARED_SECRET = "sso-shared-secret-value-must-be-32-plus";
process.env.AUTH_SECRET = "auth-secret-value-must-be-different-32";
delete process.env.NEXTAUTH_SECRET;

type SsoModule = typeof import("./sso");

const secret = new TextEncoder().encode(process.env.SSO_SHARED_SECRET);

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signHr(overrides: Record<string, unknown> = {}, headerAlg = "HS256") {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    email: "admin@trusttrack.com",
    username: "admin",
    name: "Admin User",
    ...overrides,
  };
  const iat = typeof claims.iat === "number" ? claims.iat : now;
  const exp = typeof claims.exp === "number" ? claims.exp : now + 90;
  const sub = typeof claims.sub === "string" ? claims.sub : "ims-user-1";
  const aud = typeof claims.aud === "string" ? claims.aud : "hr";
  const jti =
    typeof claims.jti === "string" ? claims.jti : `jti-${now}-${Math.random().toString(16).slice(2)}`;
  delete claims.iat;
  delete claims.exp;
  delete claims.sub;
  delete claims.aud;
  delete claims.jti;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: headerAlg, typ: "JWT" })
    .setSubject(sub)
    .setAudience(aud)
    .setJti(jti)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
}

test("accepts an HS256 HR handoff and ignores a password claim", async () => {
  const sso: SsoModule = await import("./sso");
  const token = await signHr({ password: "should-not-matter", jti: "jti-password-ignored" });
  const claims = await sso.verifyHrSsoToken(token);
  assert.equal(claims.aud, "hr");
  assert.equal(claims.email, "admin@trusttrack.com");
  assert.equal(claims.jti, "jti-password-ignored");
  assert.equal("password" in claims, false);
});

test("rejects alg none, HS384, and RS256", async () => {
  const sso: SsoModule = await import("./sso");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "ims-user-1",
    email: "admin@trusttrack.com",
    username: "admin",
    aud: "hr",
    jti: "jti-none",
    iat: now,
    exp: now + 60,
  };
  const noneToken = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.`;
  await assert.rejects(() => sso.verifyHrSsoToken(noneToken), (err: unknown) => {
    return err instanceof sso.SsoTokenError && err.code === "unsupported_alg";
  });

  const hs384 = await signHr({ jti: "jti-hs384" }, "HS384");
  await assert.rejects(() => sso.verifyHrSsoToken(hs384), (err: unknown) => {
    return err instanceof sso.SsoTokenError && err.code === "unsupported_alg";
  });

  const { privateKey } = await generateKeyPair("RS256");
  const rs = await new SignJWT({
    email: "admin@trusttrack.com",
    username: "admin",
    name: "Admin",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("ims-user-1")
    .setAudience("hr")
    .setJti("jti-rs")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey);
  await assert.rejects(() => sso.verifyHrSsoToken(rs), (err: unknown) => {
    return err instanceof sso.SsoTokenError && err.code === "unsupported_alg";
  });
});

test("rejects the wrong audience, an expired token, and a long lifetime", async () => {
  const sso: SsoModule = await import("./sso");
  const now = Math.floor(Date.now() / 1000);

  await assert.rejects(
    async () => sso.verifyHrSsoToken(await signHr({ aud: "sales", jti: "jti-sales" })),
    (err: unknown) => err instanceof sso.SsoTokenError && err.code === "wrong_audience",
  );

  await assert.rejects(
    async () =>
      sso.verifyHrSsoToken(
        await signHr({ jti: "jti-expired", iat: now - 120, exp: now - 30 }),
      ),
    (err: unknown) => err instanceof sso.SsoTokenError && err.code === "expired",
  );

  const withinSkew = await sso.verifyHrSsoToken(
    await signHr({ jti: "jti-skew", iat: now - 20, exp: now - 5 }),
  );
  assert.equal(withinSkew.jti, "jti-skew");

  await assert.rejects(
    async () =>
      sso.verifyHrSsoToken(
        await signHr({ jti: "jti-long", iat: now, exp: now + 600 }),
      ),
    (err: unknown) => err instanceof sso.SsoTokenError && err.code === "invalid",
  );

  const previous = process.env.SSO_SHARED_SECRET;
  process.env.SSO_SHARED_SECRET = "a-different-sso-secret-that-is-32-chars-min";
  await assert.rejects(
    async () => sso.verifyHrSsoToken(await signHr({ jti: "jti-wrong-key" })),
    (err: unknown) => err instanceof sso.SsoTokenError && err.code === "invalid",
  );
  process.env.SSO_SHARED_SECRET = previous;
});

test("redeems jti once and matches email before username", async () => {
  const sso: SsoModule = await import("./sso");
  const now = Math.floor(Date.now() / 1000);
  const { db, ensureDatabase } = await import("./db");
  await ensureDatabase();

  await db.execute({
    sql: `INSERT INTO users (id, email, name, role, phone, password_hash)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: ["user-sso-email", "sso.email@example.com", "Email Match", "hr", "+255700000001", "x"],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, name, role, phone, password_hash)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: ["user-sso-phone", "other@example.com", "Phone Match", "supervisor", "+255700000002", "x"],
  });
  await db.execute({
    sql: `INSERT INTO employees (id, name, phone, type, active) VALUES (?, ?, ?, ?, ?)`,
    args: ["emp-inactive", "Inactive", "+255700000099", "fulltime", 0],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, name, role, phone, password_hash, employee_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "user-sso-inactive",
      "inactive@example.com",
      "Inactive User",
      "employee",
      "+255700000003",
      "x",
      "emp-inactive",
    ],
  });

  assert.equal(await sso.redeemSsoJti("jti-once", now + 60), true);
  assert.equal(await sso.redeemSsoJti("jti-once", now + 60), false);

  const byEmail = await sso.findTrustTrackUserForSso("SSO.Email@example.com", "not-a-user");
  assert.equal(byEmail.status, "matched");
  if (byEmail.status === "matched") assert.equal(byEmail.user.id, "user-sso-email");

  const byPhone = await sso.findTrustTrackUserForSso("missing@example.com", "+255700000002");
  assert.equal(byPhone.status, "matched");
  if (byPhone.status === "matched") assert.equal(byPhone.user.id, "user-sso-phone");

  const missing = await sso.findTrustTrackUserForSso("nobody@example.com", "nobody");
  assert.equal(missing.status, "missing");

  const inactive = await sso.findTrustTrackUserForSso("inactive@example.com", "inactive");
  assert.equal(inactive.status, "inactive");
});

test("rejects a shared secret that matches AUTH_SECRET or is too short", async () => {
  const sso: SsoModule = await import("./sso");
  const original = process.env.SSO_SHARED_SECRET;
  process.env.SSO_SHARED_SECRET = process.env.AUTH_SECRET;
  assert.throws(() => sso.ssoSharedSecretKey(), sso.SsoConfigError);
  process.env.SSO_SHARED_SECRET = "short";
  assert.throws(() => sso.ssoSharedSecretKey(), sso.SsoConfigError);
  process.env.SSO_SHARED_SECRET = original;
});
