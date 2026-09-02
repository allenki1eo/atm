import { NextResponse } from "next/server";

/**
 * Wraps a Next.js route handler so an uncaught throw becomes a JSON 500
 * instead of an HTML/plain-text error page.
 *
 * Without this, a crash mid-handler makes the browser's `res.json()` fail with
 * "Unexpected token 'A', "An error o"... is not valid JSON" — which tells the
 * user nothing. With it, the client always gets `{ error: "..." }`.
 *
 * Usage:
 *   async function _GET(req: NextRequest) { ... }
 *   export const GET = apiHandler(_GET);
 */
export function apiHandler<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  H extends (...args: any[]) => Promise<Response>
>(fn: H): H {
  return (async (...args: Parameters<H>) => {
    try {
      return await fn(...args);
    } catch (err) {
      const req = args[0] as { method?: string; nextUrl?: { pathname?: string } } | undefined;
      const method = req?.method ?? "?";
      const path = req?.nextUrl?.pathname ?? "?";
      console.error(`[API ${method} ${path}]`, err);

      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Internal server error",
        },
        { status: 500 }
      );
    }
  }) as H;
}
