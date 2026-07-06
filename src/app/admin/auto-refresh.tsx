"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps /admin live without a manual reload. Calls the App Router's refresh()
 * — which re-runs the server component, re-fetches all data, and updates the
 * notification badges/counts + any section that reads from server props — on:
 *   - a steady interval (only while the tab is visible, to avoid waste),
 *   - window focus, and
 *   - the tab becoming visible again.
 *
 * refresh() reconciles in place: open tabs, expanded cards and in-progress form
 * inputs are preserved. Renders nothing.
 */
export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => router.refresh();
    const start = () => { if (timer === null) timer = setInterval(tick, intervalMs); };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { tick(); start(); } else stop();
    };
    const onFocus = () => tick();

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
