import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { can, type Capability } from "@/lib/auth/roles";

/**
 * Path-prefix → required capability. Centralized RBAC for whole API areas
 * (checked after authentication). Field-level rules (e.g. inventory may PUT
 * stock but not price) still live in the individual route.
 */
const API_GUARDS: { prefix: string; cap: Capability }[] = [
  { prefix: "/api/admin/finance", cap: "finance.view" },
  { prefix: "/api/admin/receivables", cap: "finance.view" },
  { prefix: "/api/admin/users", cap: "users.manage" },
  // Directory (list/create) is sales-safe; the [id] account routes enforce
  // customers.account themselves.
  { prefix: "/api/admin/companies", cap: "customers.directory" },
  { prefix: "/api/admin/batches", cap: "batches.view" },
  { prefix: "/api/admin/approvals", cap: "approvals.resolve" },
  { prefix: "/api/admin/reports", cap: "reports.view" },
  { prefix: "/api/admin/quotations", cap: "sales.quote" },
  { prefix: "/api/admin/purchase-orders", cap: "sales.po.create" },
  { prefix: "/api/admin/outreach", cap: "outreach.use" },
  // Floor is view/approve; the run (POST) route enforces leads.run itself.
  { prefix: "/api/admin/leads", cap: "leads.manage" },
];

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
  const { pathname, search } = request.nextUrl;

  if (user) {
    // Authenticated → enforce area-level role guards for APIs.
    const guard = API_GUARDS.find((g) => pathname.startsWith(g.prefix));
    if (guard && !can(user.role, guard.cap)) {
      return NextResponse.json(
        { error: "You don't have permission for this." },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

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
