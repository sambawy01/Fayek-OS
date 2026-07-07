import { db } from "./db";

/**
 * Per-product sales velocity, keyed by SLUG (not the old fragile name match),
 * over several look-back windows. One grouped query with FILTERed sums so the
 * 7 / 30 / 90-day figures come back in a single pass. Excludes cancelled POs and
 * blank slugs. Consumed by:
 *   - the dynamic reorder point (production.recomputeReorderPoints) → perDay30
 *   - AI production suggestions (ai-production) → d7/d30/d90 trend
 *
 * Lives in its own module (imports only `db`) so both production.ts and
 * ai-production.ts can use it without an import cycle.
 */
export interface Velocity {
  d7: number;
  d30: number;
  d90: number;
  /** Units/day over the 30-day window (the demand rate the reorder point sizes against). */
  perDay30: number;
  /** Units/day over the 90-day window (a steadier rate, used for trend context). */
  perDay90: number;
}

/** Safety buffer (extra days of demand) added on top of lead time in the reorder point. */
export const SAFETY_DAYS = 14;

/**
 * The velocity-driven reorder point for one product, BEFORE the manual floor.
 * Two forces, whichever is larger:
 *   - demand over the replenishment window: perDay30 × (lead time + SAFETY_DAYS)
 *   - a movement tier floor: 30 for a "fast" item (any sale in the last 30 days),
 *     10 for a slow/idle one — so fast movers never sit below a 30-unit buffer.
 * Callers combine this with the owner's manual reorder_point via GREATEST(), so
 * the effective trigger is GREATEST(manual, velocity-window, tier floor).
 */
export function computedReorderPoint(v: Velocity | undefined, leadDays: number): number {
  const perDay30 = v?.perDay30 ?? 0;
  const tierFloor = (v?.d30 ?? 0) > 0 ? 30 : 10;
  return Math.max(Math.round(perDay30 * (leadDays + SAFETY_DAYS)), tierFloor);
}

export async function productVelocity(): Promise<Map<string, Velocity>> {
  const rows = (await db()`
    SELECT l.slug AS slug,
      COALESCE(SUM(l.qty) FILTER (WHERE po.created_at >= now() - interval '7 days'), 0)::int  AS d7,
      COALESCE(SUM(l.qty) FILTER (WHERE po.created_at >= now() - interval '30 days'), 0)::int AS d30,
      COALESCE(SUM(l.qty) FILTER (WHERE po.created_at >= now() - interval '90 days'), 0)::int AS d90
    FROM purchase_order_lines l
    JOIN purchase_orders po ON po.id = l.po_id
    WHERE po.status <> 'cancelled' AND l.slug <> ''
      AND po.created_at >= now() - interval '90 days'
    GROUP BY l.slug
  `) as { slug: string; d7: number; d30: number; d90: number }[];
  const out = new Map<string, Velocity>();
  for (const r of rows) {
    const d7 = Number(r.d7), d30 = Number(r.d30), d90 = Number(r.d90);
    out.set(r.slug, { d7, d30, d90, perDay30: d30 / 30, perDay90: d90 / 90 });
  }
  return out;
}
