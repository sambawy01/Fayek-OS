import { SignJWT, jwtVerify } from "jose";
import { isRole, type Role } from "./roles";

/**
 * Stateless session tokens (signed JWT, HS256). Edge-safe (jose only, no Node
 * crypto / DB) so the middleware AND server components share one verify path.
 *
 * The role is baked into the signed token, so gating by role is trustworthy
 * without a per-request DB read. Trade-off: a role change or a deactivation
 * only takes full effect on the next login or when the token expires (SESSION_
 * TTL). Good enough for a small internal team; a denylist can be added later.
 */
export const SESSION_COOKIE = "fayek_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionUser {
  uid: number;
  role: Role;
  name: string;
  username: string;
}

const DEV_FALLBACK_SECRET = "fayek-dev-insecure-session-secret";

/**
 * Signing key. Reuses SESSION_SECRET, falling back to CRON_SECRET (already set
 * in prod) so no extra env var is required. Fails closed in production if
 * neither is set; uses a fixed dev key otherwise so local dev works.
 */
function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET || process.env.CRON_SECRET;
  if (s) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Session secret missing: set SESSION_SECRET or CRON_SECRET in production."
    );
  }
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.uid))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Verify a raw token → the session user, or null when invalid/expired. */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const uid = Number(payload.sub);
    const role = payload.role;
    if (!Number.isInteger(uid) || !isRole(role)) return null;
    return {
      uid,
      role,
      name: typeof payload.name === "string" ? payload.name : "",
      username: typeof payload.username === "string" ? payload.username : "",
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
