import { NextRequest, NextResponse } from "next/server";
import { cronAuthError } from "@/lib/reports/shared";
import {
  addLedgerEntry,
  advanceRecurDate,
  listLedger,
  updateLedgerEntry,
  type LedgerEntry,
  type NewLedgerEntry,
} from "@/lib/finance";

/**
 * Daily cron that materializes recurring finance entries. For each active
 * recurring TEMPLATE whose `recurring.nextDate` has arrived (or is overdue), it
 * creates a child entry dated on each due occurrence and advances the template's
 * nextDate. Children are marked `unpaid` (due on their date) so the owner
 * confirms the cash movement, and carry `recurringParentId` for idempotency —
 * a re-run never double-creates. Overdue templates backfill every missed
 * occurrence up to today (bounded).
 *
 * Auth: Vercel Bearer CRON_SECRET (fail-closed via cronAuthError). Fail-soft per
 * template — one bad template never aborts the rest.
 */
export const dynamic = "force-dynamic";

const MAX_BACKFILL = 60; // safety cap per template (>1yr of weeklies)

/** Today's Cairo calendar date, YYYY-MM-DD. */
function cairoTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Build a one-off child entry from a template, dated `date`. */
function childFor(t: LedgerEntry, date: string): NewLedgerEntry {
  return {
    date,
    direction: t.direction,
    category: t.category,
    amountEgp: t.amountEgp,
    method: t.method,
    note: t.note,
    paymentStatus: "unpaid",
    dueDate: date,
    recurringParentId: t.id,
    ...(t.vendor ? { vendor: t.vendor } : {}),
    ...(t.reference ? { reference: t.reference } : {}),
    ...(t.taxRatePct !== undefined ? { taxRatePct: t.taxRatePct } : {}),
    ...(t.currency ? { currency: t.currency } : {}),
    ...(t.costCenter ? { costCenter: t.costCenter } : {}),
    ...(t.links ? { links: t.links } : {}),
    ...(t.lineItems ? { lineItems: t.lineItems } : {}),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = cronAuthError(request);
  if (unauthorized) return unauthorized;

  const today = cairoTodayKey();

  let ledger: LedgerEntry[];
  try {
    ledger = await listLedger();
  } catch (error) {
    console.error("[finance-recurring] failed to load ledger:", error);
    return NextResponse.json({ error: "ledger unavailable" }, { status: 503 });
  }

  // Existing children, keyed by parent+date, so a re-run is idempotent.
  const existing = new Set(
    ledger
      .filter((e) => e.recurringParentId)
      .map((e) => `${e.recurringParentId}|${e.date}`)
  );
  // The template row IS occurrence #1 (its own date is already booked), so mark
  // it materialized — the cron must never re-create a child on the template's own
  // date and double-count it, regardless of how nextDate was seeded (UI/assistant/API).
  for (const e of ledger) {
    if (e.recurring) existing.add(`${e.id}|${e.date}`);
  }

  const templates = ledger.filter((e) => e.recurring?.active && e.recurring.nextDate <= today);

  let created = 0;
  const advanced: string[] = [];
  const failures: string[] = [];

  for (const t of templates) {
    const rec = t.recurring!;
    try {
      let cursor = rec.nextDate;
      let guard = 0;
      while (cursor <= today && guard < MAX_BACKFILL) {
        const key = `${t.id}|${cursor}`;
        if (!existing.has(key)) {
          // Deterministic id → a re-create overwrites rather than duplicates.
          await addLedgerEntry(childFor(t, cursor), { id: `recur-${t.id}-${cursor}` });
          existing.add(key);
          created++;
        }
        cursor = advanceRecurDate(cursor, rec.frequency);
        guard++;
      }
      if (cursor !== rec.nextDate) {
        await updateLedgerEntry(t.id, { recurring: { ...rec, nextDate: cursor } });
        advanced.push(t.id);
      }
    } catch (error) {
      console.error(`[finance-recurring] template ${t.id} failed:`, error);
      failures.push(t.id);
    }
  }

  return NextResponse.json({ ok: true, today, templates: templates.length, created, advanced: advanced.length, failures });
}
