import { errors as joseErrors, jwtVerify } from "jose";
import { db, ensureDatabase, seedDemoData } from "@/lib/db";

const MAX_TOKEN_LENGTH = 4096;

export type SsoFailure =
  | "not_configured"
  | "missing_token"
  | "invalid_token"
  | "user_not_found"
  | "inactive";

export type SsoUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  employeeId: string | null;
};

export type SsoResult =
  | { ok: true; user: SsoUser }
  | { ok: false; error: SsoFailure; email?: string };

type UserRow = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  phone: string | null;
  employee_id: string | null;
};

/**
 * Home path after a successful IMS sign-in.
 * Employees use the personal account page; other roles use the main dashboard.
 */
export function dashboardPathForRole(role: string) {
  return role === "employee" ? "/me" : "/";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function invalidToken(): SsoResult {
  return { ok: false, error: "invalid_token" };
}

/**
 * Verify an IMS HS256 token and resolve the existing TrustTrack user.
 * Does not create accounts and does not log the token.
 */
export async function authenticateSsoToken(
  token: string | null | undefined
): Promise<SsoResult> {
  if (token == null || token === "") {
    return { ok: false, error: "missing_token" };
  }
  if (token.length > MAX_TOKEN_LENGTH) return invalidToken();

  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) return { ok: false, error: "not_configured" };

  let email: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      audience: "hr",
      clockTolerance: 5,
      requiredClaims: ["aud", "exp", "iat", "sub", "email", "jti", "name", "username"],
    });

    // `aud` must be exactly "hr", not a list that merely includes it.
    if (payload.aud !== "hr") return invalidToken();
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return invalidToken();
    if (typeof payload.jti !== "string" || payload.jti.length === 0) return invalidToken();
    if (typeof payload.name !== "string" || payload.name.length === 0) return invalidToken();
    if (typeof payload.username !== "string" || payload.username.length === 0) {
      return invalidToken();
    }
    if (typeof payload.email !== "string") return invalidToken();

    email = payload.email.trim().toLowerCase();
    if (!isEmail(email)) return invalidToken();
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return invalidToken();
    console.error("SSO verification failed");
    return invalidToken();
  }

  await ensureDatabase();
  await seedDemoData();

  const result = await db.execute({
    sql: `SELECT id, email, name, role, phone, employee_id
          FROM users
          WHERE lower(email) = ?`,
    args: [email],
  });

  const user = result.rows[0] as unknown as UserRow | undefined;
  if (!user?.email) {
    return { ok: false, error: "user_not_found", email };
  }

  if (user.employee_id) {
    const empRes = await db.execute({
      sql: "SELECT active FROM employees WHERE id = ?",
      args: [user.employee_id],
    });
    const empRow = empRes.rows[0] as unknown as { active: number | bigint } | undefined;
    if (empRow && Number(empRow.active) !== 1) {
      return { ok: false, error: "inactive" };
    }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone ?? "",
      employeeId: user.employee_id ?? null,
    },
  };
}
