"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps /admin live without a manual reload, via the App Router's refresh()
 * (re-runs the server component, re-fetches data, updates notification badges +
 * every section that reads from server props — reconciled in place, so open
 * tabs, expanded cards and form inputs are preserved):
 *
 *   1. Instantly after ANY successful mutating API call (POST/PATCH/PUT/DELETE
 *      to /api/…) — so your own actions reflect across tabs/badges right away.
 *   2. On a short interval (skipped while a form field is focused) — to pick up
 *      changes made elsewhere (Telegram bot, another user).
 *   3. On window focus / tab re-visibility.
 *
 * Renders nothing.
 */
export default function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    // Coalesce bursts of actions into a single refresh.
    const scheduleRefresh = () => {
      if (debounce !== null) clearTimeout(debounce);
      debounce = setTimeout(() => router.refresh(), 300);
    };

    const tick = () => { if (!isEditing()) router.refresh(); };
    const start = () => { if (timer === null) timer = setInterval(tick, intervalMs); };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { tick(); start(); } else stop();
    };
    const onFocus = () => tick();

    // Refresh right after any successful mutating request (GET is skipped so the
    // refresh's own RSC fetch can't loop).
    const origFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const res = await origFetch(...args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input ?? "");
        const method = ((args[1]?.method ?? (input instanceof Request ? input.method : "GET")) || "GET").toUpperCase();
        if (res.ok && method !== "GET" && url.includes("/api/")) scheduleRefresh();
      } catch { /* ignore */ }
      return res;
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      if (debounce !== null) clearTimeout(debounce);
      window.fetch = origFetch;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
