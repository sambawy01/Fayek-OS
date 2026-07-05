import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Session gate for the admin surface (Edge). A valid signed session cookie is
 * required for /admin (pages) and /api/admin/* (APIs):
 * - pages → redirect to /login?next=… so the user can sign in and come back,
 * - APIs  → 401 JSON.
 *
 * This is the authoritative authentication layer; because it runs before every
 * matched route, the route handlers can trust that a request which reaches them
 * is already authenticated (they still do per-capability checks for RBAC).
 *
 * Telegram / cron / inbound-email routes are NOT matched here — they carry
 * their own shared-secret auth.
 */
export async function proxy(request: NextRequest) {
  const user = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
