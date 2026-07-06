import { NextResponse, type NextRequest } from "next/server";
import { cronAuthError, isForced } from "@/lib/reports/shared";
import { discoverAndDraftLeads } from "@/lib/prospecting";
import { releaseReserved, countReleasedSince, countLeadsByStatus } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAILY_TARGET = 4;

/**
 * Daily prospecting drip: surface ~4 potential customers into the Prospecting
 * tab for approval. Cheap by design — it promotes leads from the cached
 * `reserve` pool (filled by the weekly stockpile run / manual button) and only
 * falls back to a live web-search + AI discovery when the pool can't cover the
 * day, so the queue never goes silent.
 *
 * Auth: Vercel invokes with `Authorization: Bearer ${CRON_SECRET}`; we fail
 * closed. Idempotent within a day — counts leads *released today* (not created),
 * so it stays correct even right after a big stockpile run.
 */
export async function GET(request: NextRequest) {
  const unauthorized = cronAuthError(request);
  if (unauthorized) return unauthorized;

  const force = isForced(request);
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  if (!force) {
    const releasedToday = await countReleasedSince(since);
    if (releasedToday >= DAILY_TARGET) {
      return NextResponse.json({ skipped: "daily target already met", releasedToday });
    }
  }

  // Prefer the cached reserve pool (no search/AI spend).
  const released = await releaseReserved(DAILY_TARGET);
  const fromReserve = released.length;

  // Pool short → live-discover the shortfall into reserve, then release it, so
  // the drip is uniform (everything flows reserve → pending, stamping released_at).
  let liveCreated = 0;
  let reason: string | undefined;
  if (released.length < DAILY_TARGET) {
    const shortfall = DAILY_TARGET - released.length;
    const result = await discoverAndDraftLeads(shortfall, null, { status: "reserve" });
    liveCreated = result.created.length;
    reason = result.reason;
    if (liveCreated > 0) released.push(...(await releaseReserved(shortfall)));
  }

  const reserveRemaining = await countLeadsByStatus("reserve");
  return NextResponse.json({
    ok: true,
    released: released.length,
    fromReserve,
    liveCreated,
    reserveRemaining,
    companies: released.map((l) => l.companyName),
    ...(reason ? { reason } : {}),
  });
}
