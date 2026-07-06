import { db } from "./db";
import { raiseProduction } from "./production";

export interface StockAvailability {
  slug: string;
  onHand: number | null; // null = stock not tracked
  reserved: number;
  available: number; // max(0, onHand - reserved); Infinity-ish when untracked
  tracked: boolean;
}

/**
 * On-hand, active-reserved and available for a set of slugs. Available nets out
 * every OTHER open order's reservation, so two orders can't promise the same
 * units. Untracked products (quantity NULL) are treated as always available.
 */
export async function availability(slugs: string[]): Promise<Map<string, StockAvailability>> {
  const unique = [...new Set(slugs.filter(Boolean))];
  const out = new Map<string, StockAvailability>();
  if (unique.length === 0) return out;
  const rows = (await db()`
    SELECT p.slug,
           p.quantity AS on_hand,
           COALESCE((SELECT SUM(r.qty) FROM reservations r WHERE r.slug = p.slug AND r.status = 'active'), 0)::int AS reserved
    FROM products p
    WHERE p.slug = ANY(${unique}::text[])
  `) as { slug: string; on_hand: number | null; reserved: number }[];
  for (const r of rows) {
    const tracked = r.on_hand !== null;
    const onHand = tracked ? Number(r.on_hand) : null;
    const reserved = Number(r.reserved);
    const available = tracked ? Math.max(0, (onHand ?? 0) - reserved) : Number.MAX_SAFE_INTEGER;
    out.set(r.slug, { slug: r.slug, onHand, reserved, available, tracked });
  }
  return out;
}

/** Release a PO's active reservations (on fulfilment — realized — or cancel). */
export async function releaseReservationsForPO(poId: number): Promise<void> {
  await db()`UPDATE reservations SET status = 'released' WHERE po_id = ${poId} AND status = 'active'`;
}

export interface ReserveLine { slug: string; name: string; qty: number }
export interface ReserveResult {
  reservations: { slug: string; reserved: number }[];
  shortfalls: { slug: string; name: string; qty: number }[];
}

/**
 * Reserve available stock for an invoiced PO's lines and raise production for any
 * shortfall. For each line: reserve min(available, ordered); if ordered exceeds
 * available, the gap becomes a production order (unless the product is flagged
 * frequent_supply — replenished externally). Untracked items reserve nothing.
 * Best-effort — never throws to the invoicing caller.
 */
export async function reserveForPO(poId: number, lines: ReserveLine[]): Promise<ReserveResult> {
  const result: ReserveResult = { reservations: [], shortfalls: [] };
  try {
    const slugs = lines.map((l) => l.slug);
    const avail = await availability(slugs);
    const freqRows = (await db()`
      SELECT slug FROM products WHERE slug = ANY(${slugs}::text[]) AND frequent_supply = TRUE
    `) as { slug: string }[];
    const frequent = new Set(freqRows.map((r) => r.slug));

    for (const line of lines) {
      const qty = Math.round(line.qty);
      if (qty <= 0) continue;
      const a = avail.get(line.slug);
      if (!a || !a.tracked) continue; // untracked → nothing to reserve/produce
      const reserveQty = Math.min(a.available, qty);
      if (reserveQty > 0) {
        await db()`INSERT INTO reservations (slug, qty, po_id) VALUES (${line.slug}, ${reserveQty}, ${poId})`;
        result.reservations.push({ slug: line.slug, reserved: reserveQty });
      }
      const shortfall = qty - reserveQty;
      if (shortfall > 0 && !frequent.has(line.slug)) {
        await raiseProduction(line.slug, line.name, shortfall, "invoice_shortfall");
        result.shortfalls.push({ slug: line.slug, name: line.name, qty: shortfall });
      }
    }
  } catch {
    /* reservation is best-effort; never break invoicing */
  }
  return result;
}
