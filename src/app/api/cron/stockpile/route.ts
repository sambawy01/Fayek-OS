import { NextResponse, type NextRequest } from "next/server";
import { cronAuthError, isForced } from "@/lib/reports/shared";
import { discoverAndDraftLeads } from "@/lib/prospecting";
import { countLeadsByStatus } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Target size of the cached reserve pool and the low-water mark that triggers a refill. */
const POOL_TARGET = 30;
const REFILL_THRESHOLD = 12; // ~3 days of drip left → top back up

/**
 * Weekly stockpile: one extensive web-search + AI discovery run that fills the
 * cached `reserve` pool up to POOL_TARGET, which the daily drip then feeds out
 * ~4/day. Skips when the pool is still healthy so we don't over-spend. Partial
 * progress persists (each lead is committed as it's drafted), so a timeout mid-
 * run still grows the pool and the next run continues.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, fail closed. `?force=1` refills
 * regardless of the current pool level.
 */
export async function GET(request: NextRequest) {
  const unauthorized = cronAuthError(request);
  if (unauthorized) return unauthorized;

  const force = isForced(request);
  const have = await countLeadsByStatus("reserve");
  if (!force && have >= REFILL_THRESHOLD) {
    return NextResponse.json({ skipped: "reserve pool healthy", reserve: have });
  }

  const need = Math.max(0, POOL_TARGET - have);
  const result = await discoverAndDraftLeads(need, null, { status: "reserve", perSector: 15 });
  const reserve = await countLeadsByStatus("reserve");

  if (!result.webSearchConfigured) {
    return NextResponse.json(
      { ok: false, reason: result.reason ?? "web search not configured", reserve },
      { status: 200 }
    );
  }
  return NextResponse.json({
    ok: true,
    added: result.created.length,
    scanned: result.scanned,
    skipped: result.skipped,
    reserve,
    companies: result.created.map((l) => l.companyName),
  });
}
