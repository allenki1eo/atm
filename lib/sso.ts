import { decodeProtectedHeader, errors as joseErrors, jwtVerify } from "jose";
import { db, ensureDatabase } from "@/lib/db";

/** Matches the IMS handoff doc: a few seconds of clock skew, never past exp. */
export const SSO_CLOCK_SKEW_SECONDS = 10;

/** IMS issues 90s tokens. Reject anything signed for longer than this. */
const SSO_MAX_TTL_SECONDS = 120;

const MIN_SECRET_LENGTH = 32;

export class SsoConfigError extends Error {
  constructor() {
    super("SSO is not configured");
    this.name = "SsoConfigError";
  }
}

export class SsoTokenError extends Error {
  constructor(
    public readonly code: "invalid" | "expired" | "wrong_audience" | "unsupported_alg",
  ) {
    super(code);
    this.name = "SsoTokenError";
  }
}

export interface SsoClaims {
  sub: string;
  email: string;
  username: string;
  name: string;
  aud: "hr";
  jti: string;
  iat: number;
  exp: number;
}

export interface TrustTrackSsoUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
  phone: string | null;
  employeeId: string | null;
}

export type SsoUserLookup =
  | { status: "matched"; user: TrustTrackSsoUser }
  | { status: "inactive" }
  | { status: "missing" };

function trimmedEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/**
 * HS256 key shared with IMS. Rejects a missing/short secret and a secret
 * copied from AUTH_SECRET so the two keys cannot be collapsed into one.
 */
export function ssoSharedSecretKey(): Uint8Array {
  const secret = trimmedEnv("SSO_SHARED_SECRET");
  const authSecret = trimmedEnv("AUTH_SECRET") || trimmedEnv("NEXTAUTH_SECRET");
  if (secret.length < MIN_SECRET_LENGTH || !authSecret || secret === authSecret) {
    throw new SsoConfigError();
  }
  return new TextEncoder().encode(secret);
}

function requiredString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Verify an IMS handoff JWT for this HR app.
 * Algorithm is pinned to HS256. `none` and asymmetric algorithms are rejected
 * before the signature check. A password claim is ignored if one is present.
 */
export async function verifyHrSsoToken(token: string): Promise<SsoClaims> {
  const key = ssoSharedSecretKey();

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new SsoTokenError("invalid");
  }
  if (alg !== "HS256") {
    throw new SsoTokenError("unsupported_alg");
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      audience: "hr",
      clockTolerance: SSO_CLOCK_SKEW_SECONDS,
      maxTokenAge: `${SSO_MAX_TTL_SECONDS}s`,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new SsoTokenError("expired");
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      if (err.claim === "aud") throw new SsoTokenError("wrong_audience");
      if (err.claim === "exp" || err.claim === "iat") throw new SsoTokenError("expired");
    }
    throw new SsoTokenError("invalid");
  }

  if (payload.aud !== "hr") {
    throw new SsoTokenError("wrong_audience");
  }

  const sub = requiredString(payload.sub, 128);
  const jti = requiredString(payload.jti, 128);
  const email = typeof payload.email === "string" ? payload.email.trim() : null;
  const username = typeof payload.username === "string" ? payload.username.trim() : null;
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 200) : "";
  const iat = payload.iat;
  const exp = payload.exp;

  if (!sub || !jti || email === null || username === null) {
    throw new SsoTokenError("invalid");
  }
  if (!email && !username) {
    throw new SsoTokenError("invalid");
  }
  if (email.length > 320 || username.length > 128) {
    throw new SsoTokenError("invalid");
  }
  if (typeof iat !== "number" || typeof exp !== "number") {
    throw new SsoTokenError("invalid");
  }

  const now = Math.floor(Date.now() / 1000);
  if (iat > now + SSO_CLOCK_SKEW_SECONDS) {
    throw new SsoTokenError("invalid");
  }
  if (exp <= iat || exp - iat > SSO_MAX_TTL_SECONDS) {
    throw new SsoTokenError("invalid");
  }
  if (exp + SSO_CLOCK_SKEW_SECONDS < now) {
    throw new SsoTokenError("expired");
  }

  return { sub, email, username, name, aud: "hr", jti, iat, exp };
}

/**
 * Record `jti` until after `exp`. Returns false when this id was already redeemed.
 * The row lives in Turso/libSQL so a second serverless instance cannot replay it.
 */
export async function redeemSsoJti(jti: string, exp: number): Promise<boolean> {
  await ensureDatabase();
  const now = Math.floor(Date.now() / 1000);
  const keepUntil = exp + SSO_CLOCK_SKEW_SECONDS;
  const results = await db.batch(
    [
      {
        sql: "DELETE FROM sso_redeemed_jtis WHERE expires_at <= ?",
        args: [now],
      },
      {
        sql: `INSERT INTO sso_redeemed_jtis (jti, expires_at)
              VALUES (?, ?)
              ON CONFLICT(jti) DO NOTHING`,
        args: [jti, keepUntil],
      },
    ],
    "write",
  );
  return (results[1]?.rowsAffected ?? 0) > 0;
}

type UserRow = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  phone: string | null;
  employee_id: string | null;
};

async function loadUser(sql: string, arg: string): Promise<UserRow | null> {
  const result = await db.execute({ sql, args: [arg] });
  return (result.rows[0] as unknown as UserRow | undefined) ?? null;
}

async function lookupStatus(row: UserRow | null): Promise<SsoUserLookup | null> {
  if (!row) return null;
  if (row.employee_id) {
    const emp = await db.execute({
      sql: "SELECT active FROM employees WHERE id = ?",
      args: [row.employee_id],
    });
    const empRow = emp.rows[0] as unknown as { active: number } | undefined;
    if (empRow && Number(empRow.active) !== 1) {
      return { status: "inactive" };
    }
  }
  return {
    status: "matched",
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      phone: row.phone,
      employeeId: row.employee_id,
    },
  };
}

/**
 * Match an existing TrustTrack user. Email wins, then username against email
 * or phone (the local login identifiers). Never inserts a user.
 */
export async function findTrustTrackUserForSso(
  email: string,
  username: string,
): Promise<SsoUserLookup> {
  await ensureDatabase();

  const emailNorm = email.trim().toLowerCase();
  if (emailNorm) {
    const byEmail = await lookupStatus(
      await loadUser(
        "SELECT id, email, name, role, phone, employee_id FROM users WHERE lower(email) = ? LIMIT 1",
        emailNorm,
      ),
    );
    if (byEmail) return byEmail;
  }

  const usernameNorm = username.trim();
  if (usernameNorm) {
    const byUsernameEmail = await lookupStatus(
      await loadUser(
        "SELECT id, email, name, role, phone, employee_id FROM users WHERE lower(email) = lower(?) LIMIT 1",
        usernameNorm,
      ),
    );
    if (byUsernameEmail) return byUsernameEmail;

    const byPhone = await lookupStatus(
      await loadUser(
        "SELECT id, email, name, role, phone, employee_id FROM users WHERE phone = ? LIMIT 1",
        usernameNorm,
      ),
    );
    if (byPhone) return byPhone;
  }

  return { status: "missing" };
}
