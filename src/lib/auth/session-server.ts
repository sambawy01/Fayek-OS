import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";
import { can, type Capability } from "./roles";

/**
 * Server-side session access for server components and route handlers (NOT the
 * Edge middleware — that reads request.cookies directly). Returns the signed-in
 * user or null.
 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Route-handler guard: 401 if signed out, 403 if the capability is missing. */
export async function requireCapability(
  cap: Capability
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSession();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  if (!can(user.role, cap)) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission for this action." },
        { status: 403 }
      ),
    };
  }
  return { user };
}
