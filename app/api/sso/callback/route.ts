import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import {
  authenticateSsoToken,
  dashboardPathForRole,
  type SsoFailure,
} from "@/lib/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ssoErrorResponse(error: SsoFailure, email?: string) {
  const copy: Record<SsoFailure, { status: number; title: string; body: string }> = {
    not_configured: {
      status: 503,
      title: "Sign-in is unavailable",
      body: "Single sign-on is not configured on TrustTrack. Ask an administrator to set the shared SSO secret.",
    },
    missing_token: {
      status: 400,
      title: "Missing sign-in link",
      body: "TrustTrack did not receive a sign-in token. Open TrustTrack again from IMS.",
    },
    invalid_token: {
      status: 401,
      title: "Sign-in link rejected",
      body: "This sign-in link is invalid or has expired. Return to IMS and open TrustTrack again.",
    },
    user_not_found: {
      status: 403,
      title: "No TrustTrack account",
      body: email
        ? `No TrustTrack account exists for ${email}. Ask an HR administrator to create the account first, then open TrustTrack again from IMS.`
        : "No TrustTrack account exists for this email. Ask an HR administrator to create the account first, then open TrustTrack again from IMS.",
    },
    inactive: {
      status: 403,
      title: "Account deactivated",
      body: "This TrustTrack account is deactivated. Ask an HR administrator to restore it before signing in from IMS.",
    },
  };

  const { status, title, body } = copy[error];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>${escapeHtml(title)} · TrustTrack</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 32rem; margin: 1.5rem; padding: 1.75rem; background: #fff; color: #0f172a; border-radius: 1rem; }
    h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
    p { margin: 0 0 1rem; line-height: 1.5; }
    a { color: #6d28d9; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
    <p><a href="/login">Sign in with a TrustTrack password</a></p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await authenticateSsoToken(token);

  if (!result.ok) {
    return ssoErrorResponse(result.error, result.email);
  }

  const destination = dashboardPathForRole(result.user.role);

  try {
    // Verifies the token again inside the IMS credentials provider, then
    // writes the same NextAuth JWT session cookie as password sign-in.
    await signIn("ims", {
      token,
      redirect: false,
      redirectTo: destination,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return ssoErrorResponse("invalid_token");
    }
    throw error;
  }

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
