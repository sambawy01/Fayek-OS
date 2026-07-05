import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import {
  createUser,
  listUsers,
  countEmployees,
  MAX_EMPLOYEES,
} from "@/lib/auth/users";
import { isRole, ROLE_LABELS, type Role } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strip the password hash before returning users to the client. */
function publicUser(u: {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
    active: u.active,
    createdAt: u.createdAt,
  };
}

export async function GET() {
  const guard = await requireCapability("users.manage");
  if ("error" in guard) return guard.error;
  const users = await listUsers();
  return NextResponse.json({ users: users.map(publicUser) });
}

export async function POST(request: Request) {
  const guard = await requireCapability("users.manage");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;

  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–40 characters (letters, digits, . _ -)." },
      { status: 400 }
    );
  }
  if (!isRole(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  // Only an Owner may create another Owner.
  if (role === "owner" && guard.user.role !== "owner") {
    return NextResponse.json(
      { error: "Only an Owner can create another Owner." },
      { status: 403 }
    );
  }
  // Employee (non-owner) seat limit.
  if (role !== "owner" && (await countEmployees()) >= MAX_EMPLOYEES) {
    return NextResponse.json(
      {
        error: `Employee limit reached (${MAX_EMPLOYEES}). Delete or reassign a user to add another.`,
      },
      { status: 403 }
    );
  }

  try {
    const user = await createUser({ username, name: name || username, role, password });
    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Could not create the user." }, { status: 500 });
  }
}
