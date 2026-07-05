import { NextResponse, type NextRequest } from "next/server";
import { cronAuthError, isForced } from "@/lib/reports/shared";
import { discoverAndDraftLeads } from "@/lib/prospecting";
import { countLeadsSince } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAILY_TARGET = 4;

/**
 * Daily prospecting run: surface ~4 new potential customers with a drafted,
 * branded outreach awaiting approval in the Prospecting tab.
 *
 * Auth: Vercel invokes with `Authorization: Bearer ${CRON_SECRET}`; we fail
 * closed. Idempotent within a day — if a run already produced the day's target
 * (e.g. Vercel retried), we skip so we don't over-spend on search/AI.
 */
export async function GET(request: NextRequest) {
  const unauthorized = cronAuthError(request);
  if (unauthorized) return unauthorized;

  const force = isForced(request);
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  if (!force) {
    const already = await countLeadsSince(since);
    if (already >= DAILY_TARGET) {
      return NextResponse.json({ skipped: "daily target already met", already });
    }
  }

  const result = await discoverAndDraftLeads(DAILY_TARGET, null);
  return NextResponse.json({
    ok: true,
    created: result.created.length,
    companies: result.created.map((l) => l.companyName),
    scanned: result.scanned,
    skipped: result.skipped,
    webSearchConfigured: result.webSearchConfigured,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
