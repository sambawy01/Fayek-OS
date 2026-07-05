import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import {
  getUserById,
  updateUser,
  countActiveOwners,
} from "@/lib/auth/users";
import { isRole, ROLE_LABELS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/<id> — update name / role / active / password.
 * Guards:
 * - Only an Owner may edit an Owner, or promote anyone to Owner.
 * - You cannot deactivate the last active Owner.
 * - You cannot deactivate yourself or change your own role (avoid lock-out).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("users.manage");
  if ("error" in guard) return guard.error;
  const me = guard.user;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: {
    name?: string;
    role?: (typeof target)["role"];
    active?: boolean;
    password?: string;
  } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.role !== undefined) {
    if (!isRole(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.password === "string") {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    patch.password = body.password;
  }

  // Owner protection: only an Owner may edit an Owner or grant the Owner role.
  const touchesOwner = target.role === "owner" || patch.role === "owner";
  if (touchesOwner && me.role !== "owner") {
    return NextResponse.json(
      { error: "Only an Owner can manage Owner accounts." },
      { status: 403 }
    );
  }
  // Self-protection: don't let someone lock themselves out.
  if (id === me.uid) {
    if (patch.active === false) {
      return NextResponse.json(
        { error: "You can't deactivate your own account." },
        { status: 400 }
      );
    }
    if (patch.role !== undefined && patch.role !== me.role) {
      return NextResponse.json(
        { error: "You can't change your own role." },
        { status: 400 }
      );
    }
  }
  // Never remove the last active Owner.
  const removingOwner =
    target.role === "owner" &&
    ((patch.active === false) || (patch.role !== undefined && patch.role !== "owner"));
  if (removingOwner && (await countActiveOwners()) <= 1) {
    return NextResponse.json(
      { error: "There must be at least one active Owner." },
      { status: 400 }
    );
  }

  const updated = await updateUser(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.name,
      role: updated.role,
      roleLabel: ROLE_LABELS[updated.role],
      active: updated.active,
      createdAt: updated.createdAt,
    },
  });
}
