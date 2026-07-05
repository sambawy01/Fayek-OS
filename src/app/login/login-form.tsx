"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Sign-in failed.");
        setBusy(false);
        return;
      }
      // Full navigation so the new session cookie is picked up server-side.
      window.location.href = next || "/admin";
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[#38492E]/15 bg-white px-3.5 py-2.5 text-[#38492E] outline-none focus:border-[#357F75]";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">
          Username
        </label>
        <input
          className={inputCls}
          value={username}
          autoComplete="username"
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">
          Password
        </label>
        <input
          className={inputCls}
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-[#B5483A]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !username || !password}
        className="w-full rounded-full bg-[#357F75] px-5 py-2.5 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
