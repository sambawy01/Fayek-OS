"use client";

import { useState } from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  roleLabel: string;
  active: boolean;
  createdAt: string;
}

const inputCls =
  "w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
const primaryBtn =
  "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Request failed (${res.status}).`;
}

export default function UsersSection({
  initialUsers,
  currentUserId,
  currentRole,
}: {
  initialUsers: AdminUser[];
  currentUserId: number;
  currentRole: Role;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Which roles this user may assign (admin can't create/grant owner).
  const assignableRoles: Role[] =
    currentRole === "owner" ? [...ROLES] : ROLES.filter((r) => r !== "owner");

  const [nu, setNu] = useState({ username: "", name: "", role: "sales" as Role, password: "" });

  async function createUser() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nu),
      });
      if (!res.ok) return setError(await readError(res));
      const { user } = (await res.json()) as { user: AdminUser };
      setUsers((prev) => [...prev, user]);
      setNu({ username: "", name: "", role: "sales", password: "" });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return setError(await readError(res));
      const { user } = (await res.json()) as { user: AdminUser };
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function resetPassword(u: AdminUser) {
    const pw = window.prompt(`New password for "${u.username}" (min 8 chars):`);
    if (pw == null) return;
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    void patch(u.id, { password: pw });
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-[#38492E]">Users</h2>
        <p className="mt-1 text-sm text-[#5E6B4F]">
          Staff logins and their roles. Each person signs in with their own
          username and password.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-[#B5483A]/30 bg-[#FBF4E6] px-5 py-3 text-sm text-[#B5483A]">
          {error}
        </div>
      )}

      {/* create */}
      <div className="mb-6 rounded-2xl border border-[#38492E]/10 bg-[#FBF4E6] px-5 py-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">
          Add a user
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={inputCls} placeholder="username" value={nu.username}
            onChange={(e) => setNu({ ...nu, username: e.target.value })} />
          <input className={inputCls} placeholder="full name" value={nu.name}
            onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <select className={inputCls} value={nu.role}
            onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <input className={inputCls} type="password" placeholder="password (min 8)"
            value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        </div>
        <div className="mt-3">
          <button className={primaryBtn} disabled={busy || !nu.username || !nu.password}
            onClick={() => void createUser()}>
            Add user
          </button>
        </div>
      </div>

      {/* list */}
      <div className="space-y-2">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const canEdit =
            (u.role !== "owner" || currentRole === "owner") && !isSelf;
          return (
            <div key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#38492E]">
                  {u.name || u.username}
                  <span className="ml-2 rounded-full bg-[#38492E]/10 px-2 py-0.5 text-xs text-[#38492E]">
                    {u.roleLabel}
                  </span>
                  {!u.active && (
                    <span className="ml-2 rounded-full bg-[#B5483A]/12 px-2 py-0.5 text-xs text-[#B5483A]">
                      deactivated
                    </span>
                  )}
                  {isSelf && <span className="ml-2 text-xs text-[#5E6B4F]">(you)</span>}
                </p>
                <p className="text-xs text-[#5E6B4F]">@{u.username}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <select
                    className="rounded-xl border border-[#38492E]/15 bg-white px-2 py-1 text-sm text-[#38492E]"
                    value={u.role} disabled={busy}
                    onChange={(e) => void patch(u.id, { role: e.target.value })}>
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                )}
                <button className={subtleBtn} disabled={busy}
                  onClick={() => resetPassword(u)}>Reset password</button>
                {canEdit && (
                  <button className={subtleBtn} disabled={busy}
                    onClick={() => void patch(u.id, { active: !u.active })}>
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
