"use client";

import { useState, useEffect } from "react";
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
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";

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
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Which roles this user may assign (admin can't create/grant owner).
  const assignableRoles: Role[] =
    currentRole === "owner" ? [...ROLES] : ROLES.filter((r) => r !== "owner");

  const [nu, setNu] = useState({ username: "", name: "", role: "sales" as Role, password: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ username: "", name: "" });

  const MAX_EMPLOYEES = 4;
  const employeeCount = users.filter((u) => u.role !== "owner").length;
  const atLimit = employeeCount >= MAX_EMPLOYEES;

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

  function startEdit(u: AdminUser) {
    setError(null);
    setEditId(u.id);
    setEditForm({ username: u.username, name: u.name });
  }
  async function saveEdit() {
    if (editId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editForm.username.trim(), name: editForm.name.trim() }),
      });
      if (!res.ok) return setError(await readError(res));
      const { user } = (await res.json()) as { user: AdminUser };
      setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
      setEditId(null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function del(u: AdminUser) {
    if (!window.confirm(`Delete "${u.username}" permanently? Their history is kept but the login is removed.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) return setError(await readError(res));
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Users</h2>
        <p className="mt-1 text-sm text-[#5B7186]">
          Staff logins and their roles. Each person signs in with their own
          username and password.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">
          {error}
        </div>
      )}

      {/* create */}
      <div className="mb-6 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]">
            Add a user
          </p>
          <span className={`text-xs ${atLimit ? "text-[#CC4038]" : "text-[#5B7186]"}`}>
            {employeeCount} / {MAX_EMPLOYEES} employees
          </span>
        </div>
        {atLimit ? (
          <p className="text-sm text-[#5B7186]">
            Employee limit reached ({MAX_EMPLOYEES}). Delete or reassign a user to add another.
          </p>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* list */}
      <div className="space-y-2">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const canEdit =
            (u.role !== "owner" || currentRole === "owner") && !isSelf;
          return (
            <div key={u.id} className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0E2A47]">
                    {u.name || u.username}
                    <span className="ml-2 rounded-full bg-[#0E2A47]/10 px-2 py-0.5 text-xs text-[#0E2A47]">
                      {u.roleLabel}
                    </span>
                    {!u.active && (
                      <span className="ml-2 rounded-full bg-[#CC4038]/12 px-2 py-0.5 text-xs text-[#CC4038]">
                        deactivated
                      </span>
                    )}
                    {isSelf && <span className="ml-2 text-xs text-[#5B7186]">(you)</span>}
                  </p>
                  <p className="text-xs text-[#5B7186]">@{u.username}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <select
                      className="rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1 text-sm text-[#0E2A47]"
                      value={u.role} disabled={busy}
                      onChange={(e) => void patch(u.id, { role: e.target.value })}>
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  )}
                  {canEdit && (
                    <button className={subtleBtn} disabled={busy} onClick={() => startEdit(u)}>Edit</button>
                  )}
                  <button className={subtleBtn} disabled={busy}
                    onClick={() => resetPassword(u)}>Reset password</button>
                  {canEdit && (
                    <button className={subtleBtn} disabled={busy}
                      onClick={() => void patch(u.id, { active: !u.active })}>
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      className="rounded-full border border-[#CC4038]/40 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#CC4038] transition hover:bg-[#FBEAE8] disabled:opacity-50"
                      disabled={busy} onClick={() => void del(u)}>Delete</button>
                  )}
                </div>
              </div>
              {editId === u.id && (
                <div className="mt-3 border-t border-[#0E2A47]/10 pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Username</label>
                      <input className={inputCls} value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Full name</label>
                      <input className={inputCls} value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className={primaryBtn} disabled={busy} onClick={() => void saveEdit()}>Save</button>
                    <button className={subtleBtn} disabled={busy} onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
