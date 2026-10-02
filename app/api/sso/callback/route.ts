import { NextRequest, NextResponse } from "next/server";
import { applyAuthJsSession } from "@/lib/auth-session";
import {
  SsoConfigError,
  SsoTokenError,
  findTrustTrackUserForSso,
  redeemSsoJti,
  verifyHrSsoToken,
} from "@/lib/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  Pragma: "no-cache",
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function postLoginPath(role: string): string {
  return role === "employee" ? "/me" : "/";
}

/**
 * IMS HR handoff. GET /api/sso/callback?token=<jwt>
 * Verifies the token, redeems jti once, and opens this app's NextAuth session.
 * The redirect target never includes the token.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return jsonError(400, "Missing SSO token");
  }

  try {
    const claims = await verifyHrSsoToken(token);
    const redeemed = await redeemSsoJti(claims.jti, claims.exp);
    if (!redeemed) {
      console.error("[sso/callback] rejected", "replay");
      return jsonError(401, "SSO token has already been used");
    }

    const lookup = await findTrustTrackUserForSso(claims.email, claims.username);
    if (lookup.status === "missing") {
      console.error("[sso/callback] rejected", "no_user");
      return jsonError(
        403,
        "No TrustTrack account matches this IMS user. An admin must create a local user with the same email before SSO can sign you in.",
      );
    }
    if (lookup.status === "inactive") {
      console.error("[sso/callback] rejected", "inactive");
      return jsonError(403, "This TrustTrack account is inactive.");
    }

    const response = NextResponse.redirect(new URL(postLoginPath(lookup.user.role), request.url), 302);
    for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
      response.headers.set(key, value);
    }
    await applyAuthJsSession(response, request, lookup.user);
    return response;
  } catch (err) {
    if (err instanceof SsoConfigError) {
      console.error("[sso/callback] misconfigured");
      return jsonError(500, "SSO is not configured");
    }
    if (err instanceof SsoTokenError) {
      console.error("[sso/callback] rejected", err.code);
      const message =
        err.code === "expired"
          ? "SSO token has expired"
          : err.code === "wrong_audience"
            ? "SSO token was not issued for HR"
            : "SSO token was rejected";
      return jsonError(401, message);
    }
    console.error("[sso/callback] failed", err instanceof Error ? err.name : "unknown");
    return jsonError(500, "SSO sign-in failed");
  }
}
