import { encode } from "next-auth/jwt";
import type { NextRequest, NextResponse } from "next/server";
import { SsoConfigError, type TrustTrackSsoUser } from "@/lib/sso";

/** Same lifetime as the Credentials session in lib/auth.ts. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// Auth.js chunks session cookies above this size. See @auth/core SessionStore.
const CHUNK_SIZE = 4096 - 160;

/**
 * Cookie name Auth.js will later use as the HKDF salt.
 * Secure prefix follows AUTH_URL / NEXTAUTH_URL, then the request protocol,
 * which is the same order next-auth uses when issuing a credentials session.
 */
export function authJsSessionCookieName(request: NextRequest): { name: string; secure: boolean } {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  let protocol = request.nextUrl.protocol;
  if (envUrl) {
    try {
      protocol = new URL(envUrl).protocol;
    } catch {
      // A bad AUTH_URL falls back to the incoming request protocol.
    }
  }
  const secure = protocol === "https:";
  return {
    name: `${secure ? "__Secure-" : ""}authjs.session-token`,
    secure,
  };
}

/**
 * Encrypt a NextAuth JWT session for this user and attach it to the response.
 * The payload matches the jwt callback in lib/auth.ts (id, role, phone, employeeId).
 */
export async function applyAuthJsSession(
  response: NextResponse,
  request: NextRequest,
  user: TrustTrackSsoUser,
): Promise<void> {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new SsoConfigError();

  const { name, secure } = authJsSessionCookieName(request);
  const sessionJwt = await encode({
    token: {
      name: user.name,
      email: user.email ?? user.phone ?? "",
      sub: user.id,
      id: user.id,
      role: user.role,
      phone: user.phone ?? "",
      employeeId: user.employeeId,
    },
    secret,
    salt: name,
    maxAge: SESSION_MAX_AGE,
  });

  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: SESSION_MAX_AGE,
  };

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name === name || cookie.name.startsWith(`${name}.`)) {
      response.cookies.set({ name: cookie.name, value: "", ...options, maxAge: 0 });
    }
  }

  if (sessionJwt.length <= CHUNK_SIZE) {
    response.cookies.set({ name, value: sessionJwt, ...options });
    return;
  }

  const chunkCount = Math.ceil(sessionJwt.length / CHUNK_SIZE);
  for (let i = 0; i < chunkCount; i++) {
    response.cookies.set({
      name: `${name}.${i}`,
      value: sessionJwt.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      ...options,
    });
  }
}
