import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;

  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isApiRoute = nextUrl.pathname.startsWith("/api/");
  const isPublicFile = nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/icons") ||
    nextUrl.pathname === "/manifest.json" ||
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/favicon.ico";

  if (isPublicFile || isApiRoute) return NextResponse.next();

  if (isAuthPage) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", nextUrl));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(nextUrl.pathname)}`, nextUrl));
  }

  // Employees can only access /me and /leave
  const role = session?.user?.role;
  if (
    role === "employee" &&
    !nextUrl.pathname.startsWith("/me") &&
    !nextUrl.pathname.startsWith("/leave")
  ) {
    return NextResponse.redirect(new URL("/me", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
