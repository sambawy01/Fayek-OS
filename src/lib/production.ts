import { db } from "./db";
import { isoString } from "./db-dates";

export type ProductionStatus =
  | "pending_approval" | "approved" | "in_production" | "done" | "rejected" | "cancelled";
export type ProductionReason = "auto_reorder" | "manual" | "invoice_shortfall";

export interface ProductionOrder {
  id: number;
  slug: string;
  name: string;
  qty: number;
  status: ProductionStatus;
  reason: ProductionReason;
  note: string;
  createdBy: number | null;
  decidedBy: number | null;
  decidedAt: string | null;
  batchId: number | null;
  createdAt: string;
}

interface Row {
  id: number; slug: string; name: string; qty: number; status: string; reason: string;
  note: string; created_by: number | null; decided_by: number | null; decided_at: string | null;
  batch_id: number | null; created_at: string;
}
function toPO(r: Row): ProductionOrder {
  return {
    id: Number(r.id), slug: r.slug, name: r.name, qty: Number(r.qty),
    status: r.status as ProductionStatus, reason: r.reason as ProductionReason, note: r.note,
    createdBy: r.created_by === null ? null : Number(r.created_by),
    decidedBy: r.decided_by === null ? null : Number(r.decided_by),
    decidedAt: r.decided_at ? isoString(r.decided_at) : null,
    batchId: r.batch_id === null ? null : Number(r.batch_id),
    createdAt: isoString(r.created_at),
  };
}

const OPEN: ProductionStatus[] = ["pending_approval", "approved", "in_production"];

export async function listProductionOrders(status?: ProductionStatus): Promise<ProductionOrder[]> {
  const rows = status
    ? ((await db()`SELECT * FROM production_orders WHERE status = ${status} ORDER BY created_at DESC LIMIT 300`) as Row[])
    : ((await db()`SELECT * FROM production_orders ORDER BY created_at DESC LIMIT 300`) as Row[]);
  return rows.map(toPO);
}

export async function getProductionOrder(id: number): Promise<ProductionOrder | null> {
  const rows = (await db()`SELECT * FROM production_orders WHERE id = ${id}`) as Row[];
  return rows[0] ? toPO(rows[0]) : null;
}

export async function countPendingProduction(): Promise<number> {
  const rows = (await db()`SELECT COUNT(*)::int AS n FROM production_orders WHERE status = 'pending_approval'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Create a production order. De-dupes on the partial unique index (one open
 * order per product) → returns null if the product already has an open one.
 */
export async function createProductionOrder(
  input: { slug: string; name: string; qty: number; reason?: ProductionReason; note?: string },
  createdBy: number | null
): Promise<ProductionOrder | null> {
  const rows = (await db()`
    INSERT INTO production_orders (slug, name, qty, reason, note, created_by)
    VALUES (${input.slug}, ${input.name}, ${Math.max(1, Math.round(input.qty))},
            ${input.reason ?? "manual"}, ${input.note ?? ""}, ${createdBy})
    ON CONFLICT DO NOTHING
    RETURNING *
  `) as Row[];
  return rows[0] ? toPO(rows[0]) : null;
}

/** Owner/Admin decision on a pending production order. */
export async function decideProductionOrder(
  id: number, decision: "approve" | "reject", decidedBy: number | null, note = ""
): Promise<ProductionOrder | null> {
  const status: ProductionStatus = decision === "approve" ? "approved" : "rejected";
  const rows = (await db()`
    UPDATE production_orders
       SET status = ${status}, decided_by = ${decidedBy}, decided_at = now(),
           note = CASE WHEN ${note} <> '' THEN ${note} ELSE note END, updated_at = now()
     WHERE id = ${id} AND status = 'pending_approval'
     RETURNING *
  `) as Row[];
  return rows[0] ? toPO(rows[0]) : null;
}

/** Advance an approved order's status (e.g. approved → in_production → done). */
export async function setProductionStatus(
  id: number, status: ProductionStatus, batchId: number | null = null
): Promise<ProductionOrder | null> {
  const rows = (await db()`
    UPDATE production_orders
       SET status = ${status},
           batch_id = COALESCE(${batchId}, batch_id),
           updated_at = now()
     WHERE id = ${id}
     RETURNING *
  `) as Row[];
  return rows[0] ? toPO(rows[0]) : null;
}

/**
 * Auto-reorder: for each slug whose TRACKED stock has fallen to/below its
 * reorder point, create a pending-approval production order (reason auto_reorder,
 * qty = reorder_qty). No-ops for untracked stock or when an open order already
 * exists (partial unique index). Best-effort — never throws to the caller.
 */
export async function checkReorder(slugs: string[]): Promise<void> {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const rows = (await db()`
      SELECT slug, name_en, quantity, reorder_point, GREATEST(reorder_qty, 1) AS reorder_qty
      FROM products
      WHERE slug = ANY(${unique}::text[]) AND quantity IS NOT NULL AND quantity <= reorder_point
    `) as { slug: string; name_en: string; quantity: number; reorder_point: number; reorder_qty: number }[];
    for (const p of rows) {
      await createProductionOrder(
        { slug: p.slug, name: p.name_en, qty: Number(p.reorder_qty), reason: "auto_reorder",
          note: `Auto: on-hand ${p.quantity} ≤ reorder point ${p.reorder_point}` },
        null
      );
    }
  } catch {
    /* reorder is best-effort; never break the stock write that triggered it */
  }
}

export { OPEN as OPEN_PRODUCTION_STATUSES };
