"use client";

import { useState } from "react";

export default function SignOut({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.href = "/login";
        }
      }}
      className="text-sm text-[#5B7186] underline underline-offset-2 hover:text-[#0E2A47] disabled:opacity-50"
      title={label}
    >
      Sign out
    </button>
  );
}
