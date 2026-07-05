import { NextResponse } from "next/server";
import { getUserByUsername } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }

  const user = await getUserByUsername(username);
  // Always run the verify to keep timing uniform between unknown-user and
  // wrong-password. A fixed dummy hash is verified when the user is missing.
  const hash =
    user?.passwordHash ??
    "scrypt$16384$00000000000000000000000000000000$00";
  const passwordOk = verifyPassword(password, hash);

  if (!user || !user.active || !passwordOk) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const token = await signSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    username: user.username,
  });
  const res = NextResponse.json({ ok: true, role: user.role, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
