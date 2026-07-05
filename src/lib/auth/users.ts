import { db } from "../db";
import { hashPassword } from "./password";
import { isRole, type Role } from "./roles";

/**
 * User records in Postgres. NODE RUNTIME (imports the DB + password hashing).
 */
export interface DbUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: string;
  password_hash: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function toUser(r: UserRow): DbUser {
  return {
    id: Number(r.id),
    username: r.username,
    name: r.name,
    role: isRole(r.role) ? r.role : "sales",
    passwordHash: r.password_hash,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const rows = (await db()`
    SELECT * FROM users WHERE lower(username) = lower(${username}) LIMIT 1
  `) as UserRow[];
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const rows = (await db()`SELECT * FROM users WHERE id = ${id} LIMIT 1`) as UserRow[];
  return rows[0] ? toUser(rows[0]) : null;
}

/** Number of ACTIVE owners — used to refuse removing the last one. */
export async function countActiveOwners(): Promise<number> {
  const rows = (await db()`
    SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND active = TRUE
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function updateUser(
  id: number,
  patch: { username?: string; name?: string; role?: Role; active?: boolean; password?: string }
): Promise<DbUser | null> {
  // Merge provided fields over the current row (partial update).
  const cur = await getUserById(id);
  if (!cur) return null;
  const username = patch.username !== undefined ? patch.username.trim() : cur.username;
  const name = patch.name !== undefined ? patch.name.trim() : cur.name;
  const role = patch.role !== undefined ? patch.role : cur.role;
  const active = patch.active !== undefined ? patch.active : cur.active;
  const passwordHash =
    patch.password !== undefined ? hashPassword(patch.password) : cur.passwordHash;
  // Throws on a duplicate username (unique index) — the route maps it to 409.
  const rows = (await db()`
    UPDATE users
       SET username = ${username}, name = ${name}, role = ${role}, active = ${active},
           password_hash = ${passwordHash}, updated_at = now()
     WHERE id = ${id}
    RETURNING *
  `) as UserRow[];
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteUser(id: number): Promise<void> {
  // FK references (created_by, etc.) are ON DELETE SET NULL, so history stays.
  await db()`DELETE FROM users WHERE id = ${id}`;
}

/** Total owners regardless of active flag — used to protect the last one. */
export async function countOwners(): Promise<number> {
  const rows = (await db()`SELECT count(*)::int AS n FROM users WHERE role = 'owner'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Max employee (non-owner) accounts. Owner seats are separate. */
export const MAX_EMPLOYEES = 4;

/** Count of employee (non-owner) accounts, active or not. */
export async function countEmployees(): Promise<number> {
  const rows = (await db()`SELECT count(*)::int AS n FROM users WHERE role <> 'owner'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function listUsers(): Promise<DbUser[]> {
  const rows = (await db()`
    SELECT * FROM users ORDER BY
      CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
                WHEN 'inventory' THEN 2 ELSE 3 END, username
  `) as UserRow[];
  return rows.map(toUser);
}

export async function createUser(input: {
  username: string;
  name: string;
  role: Role;
  password: string;
}): Promise<DbUser> {
  const hash = hashPassword(input.password);
  const rows = (await db()`
    INSERT INTO users (username, name, role, password_hash)
    VALUES (${input.username.trim()}, ${input.name.trim()}, ${input.role}, ${hash})
    RETURNING *
  `) as UserRow[];
  return toUser(rows[0]);
}

/**
 * Idempotently ensure an Owner account exists, seeded from ADMIN_USER /
 * ADMIN_PASS. Safe to call repeatedly: if any user already exists it no-ops.
 * This lets the current shared login carry over as the first Owner.
 */
export async function seedOwner(): Promise<{ seeded: boolean; username?: string }> {
  const existing = (await db()`SELECT count(*)::int AS n FROM users`) as {
    n: number;
  }[];
  if ((existing[0]?.n ?? 0) > 0) return { seeded: false };

  const username = (process.env.ADMIN_USER || "owner").trim();
  const password = process.env.ADMIN_PASS;
  if (!password) {
    throw new Error("Cannot seed Owner: ADMIN_PASS is not set.");
  }
  await createUser({ username, name: "Owner", role: "owner", password });
  return { seeded: true, username };
}
