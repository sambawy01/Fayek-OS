import { db } from "./db";
import { isoString } from "./db-dates";
import { createBatch } from "./batches";
import { createApproval } from "./approvals";
import { productVelocity, computedReorderPoint } from "./forecast";

/** Fallback production lead time (days) when a product has none set. */
const DEFAULT_LEAD_DAYS = 14;
const leadDeadline = (days: number) =>
  new Date(Date.now() + Math.max(1, days) * 86_400_000).toISOString();
const defaultDeadline = () => leadDeadline(DEFAULT_LEAD_DAYS);

export type ProductionStatus =
  | "pending_approval" | "approved" | "in_production" | "done" | "rejected" | "cancelled";
export type ProductionReason = "auto_reorder" | "manual" | "invoice_shortfall";

export interface ProductionOrder {
  id: number;
  slug: string;
  name: string;
  qty: number;
  /** The quantity the algorithm proposed at creation (frozen). null for legacy rows. */
  suggestedQty: number | null;
  status: ProductionStatus;
  reason: ProductionReason;
  note: string;
  createdBy: number | null;
  decidedBy: number | null;
  decidedAt: string | null;
  batchId: number | null;
  deadline: string | null;
  createdAt: string;
}

interface Row {
  id: number; slug: string; name: string; qty: number; suggested_qty: number | null;
  status: string; reason: string;
  note: string; created_by: number | null; decided_by: number | null; decided_at: string | null;
  batch_id: number | null; deadline: string | null; created_at: string;
}
function toPO(r: Row): ProductionOrder {
  return {
    id: Number(r.id), slug: r.slug, name: r.name, qty: Number(r.qty),
    suggestedQty: r.suggested_qty === null || r.suggested_qty === undefined ? null : Number(r.suggested_qty),
    status: r.status as ProductionStatus, reason: r.reason as ProductionReason, note: r.note,
    createdBy: r.created_by === null ? null : Number(r.created_by),
    decidedBy: r.decided_by === null ? null : Number(r.decided_by),
    decidedAt: r.decided_at ? isoString(r.decided_at) : null,
    batchId: r.batch_id === null ? null : Number(r.batch_id),
    deadline: r.deadline ? isoString(r.deadline) : null,
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
  input: { slug: string; name: string; qty: number; reason?: ProductionReason; note?: string; deadline?: string | null; leadDays?: number },
  createdBy: number | null
): Promise<ProductionOrder | null> {
  const qty = Math.max(1, Math.round(input.qty));
  // Deadline: explicit wins; else the item's lead time; else the 14-day fallback.
  const deadline = input.deadline ?? (input.leadDays ? leadDeadline(input.leadDays) : defaultDeadline());
  const rows = (await db()`
    INSERT INTO production_orders (slug, name, qty, suggested_qty, reason, note, created_by, deadline)
    VALUES (${input.slug}, ${input.name}, ${qty}, ${qty},
            ${input.reason ?? "manual"}, ${input.note ?? ""}, ${createdBy}, ${deadline})
    ON CONFLICT DO NOTHING
    RETURNING *
  `) as Row[];
  return rows[0] ? toPO(rows[0]) : null;
}

/**
 * Owner/Admin decision on a pending production order. On approve, an optional
 * `qty` overrides the working quantity (suggested_qty stays as the algorithm's
 * original, so the override is auditable). qty is ignored on reject.
 */
export async function decideProductionOrder(
  id: number, decision: "approve" | "reject", decidedBy: number | null, note = "",
  qty: number | null = null
): Promise<ProductionOrder | null> {
  const status: ProductionStatus = decision === "approve" ? "approved" : "rejected";
  const newQty = decision === "approve" && qty !== null && Number.isFinite(qty) ? Math.max(1, Math.round(qty)) : null;
  const rows = (await db()`
    UPDATE production_orders
       SET status = ${status}, decided_by = ${decidedBy}, decided_at = now(),
           qty = COALESCE(${newQty}, qty),
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
 * Ensure the single open production order for a product covers `addQty` more
 * units: bumps the existing open order's qty, or creates a new pending one.
 * Used for invoice shortfalls (aggregates demand instead of spamming orders).
 * Best-effort — never throws.
 */
export async function raiseProduction(
  slug: string, name: string, addQty: number, reason: ProductionReason = "invoice_shortfall"
): Promise<void> {
  const add = Math.round(addQty);
  if (add <= 0) return;
  try {
    // Bump qty AND suggested_qty together: suggested_qty carries the committed
    // shortfall (units already promised to invoiced orders) that the approval UI
    // warns before dropping below.
    const upd = (await db()`
      UPDATE production_orders
         SET qty = qty + ${add}, suggested_qty = COALESCE(suggested_qty, 0) + ${add}, updated_at = now()
      WHERE slug = ${slug} AND status IN ('pending_approval', 'approved', 'in_production')
      RETURNING id
    `) as { id: number }[];
    if (upd.length === 0) {
      await db()`
        INSERT INTO production_orders (slug, name, qty, suggested_qty, reason, note, deadline)
        VALUES (${slug}, ${name}, ${add}, ${add}, ${reason}, ${"Auto: invoice shortfall"},
                now() + make_interval(days => COALESCE((SELECT lead_time_days FROM products WHERE slug = ${slug}), ${DEFAULT_LEAD_DAYS})))
        ON CONFLICT DO NOTHING
      `;
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Auto-reorder: for each slug whose TRACKED stock has fallen to/below its
 * EFFECTIVE reorder point — GREATEST(manual reorder_point, velocity-driven
 * computed_reorder_point) — create a pending-approval production order (reason
 * auto_reorder, qty = reorder_qty, deadline = lead time). No-ops for untracked
 * stock or when an open order already exists (partial unique index).
 * Best-effort — never throws to the caller.
 */
export async function checkReorder(slugs: string[]): Promise<void> {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const rows = (await db()`
      SELECT slug, name_en, quantity, reorder_qty, lead_time_days, effective_point FROM (
        SELECT slug, name_en, quantity, GREATEST(reorder_qty, 1) AS reorder_qty,
               lead_time_days,
               GREATEST(reorder_point, COALESCE(computed_reorder_point, 0)) AS effective_point
        FROM products
        WHERE slug = ANY(${unique}::text[]) AND quantity IS NOT NULL AND frequent_supply = FALSE
      ) p
      WHERE quantity <= effective_point
    `) as { slug: string; name_en: string; quantity: number; reorder_qty: number; lead_time_days: number; effective_point: number }[];
    for (const p of rows) {
      await createProductionOrder(
        { slug: p.slug, name: p.name_en, qty: Number(p.reorder_qty), reason: "auto_reorder",
          leadDays: Number(p.lead_time_days),
          note: `Auto: on-hand ${p.quantity} ≤ reorder point ${p.effective_point}` },
        null
      );
    }
  } catch {
    /* reorder is best-effort; never break the stock write that triggered it */
  }
}

/**
 * Recompute every tracked, produced product's dynamic reorder point from recent
 * sales velocity (see forecast.computedReorderPoint: demand over lead+safety, or
 * a 30/10 movement-tier floor). The auto-reorder trigger (checkReorder) then
 * fires on GREATEST(manual reorder_point, this) — so fast movers and long-lead
 * items trigger earlier, while the owner's manual point stays a floor.
 * Frequent-supply and untracked items are skipped. Run daily by the cron. Best-effort.
 */
export async function recomputeReorderPoints(): Promise<{ updated: number }> {
  const velocity = await productVelocity();
  const products = (await db()`
    SELECT slug, lead_time_days FROM products WHERE quantity IS NOT NULL AND frequent_supply = FALSE
  `) as { slug: string; lead_time_days: number }[];
  const queries = products.map((p) => {
    const computed = computedReorderPoint(velocity.get(p.slug), Number(p.lead_time_days));
    return db()`UPDATE products SET computed_reorder_point = ${computed}, updated_at = now() WHERE slug = ${p.slug}`;
  });
  if (queries.length) await db().transaction(queries);
  return { updated: queries.length };
}

export interface DispatchResult {
  ok: boolean;
  reason?: "not_found" | "bad_status" | "bad_qty";
  order?: ProductionOrder;
  batchId?: number;
  escalated?: boolean;
}

/**
 * Factory dispatches a produced order to the warehouse: creates a batch (the
 * existing dispatch → receive → stock flow) for the ACTUAL produced quantity and
 * marks the production order done. If the dispatched quantity differs from what
 * was ordered, an approval is raised to Owner/Admin (production_discrepancy).
 */
export async function dispatchProductionOrder(
  id: number, dispatchQty: number, dispatchedBy: number | null
): Promise<DispatchResult> {
  const order = await getProductionOrder(id);
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== "approved" && order.status !== "in_production") return { ok: false, reason: "bad_status" };
  const qty = Math.round(dispatchQty);
  if (!(qty > 0)) return { ok: false, reason: "bad_qty" };

  const batch = await createBatch(
    { reference: `PRD-${order.id}`, supplier: "Factory", notes: order.note || "",
      lines: [{ slug: order.slug, name: order.name, expectedQty: qty }] },
    dispatchedBy
  );
  await setProductionStatus(id, "done", batch.id);

  let escalated = false;
  if (qty !== order.qty) {
    escalated = true;
    await createApproval({
      type: "production_discrepancy",
      refBatchId: null, // NOT the batch-discrepancy flow — pure escalation, no stock side effect
      title: `Production PRD-${order.id} (${order.name}): dispatched ${qty} vs ordered ${order.qty}`,
      detail: { productionId: order.id, slug: order.slug, name: order.name, orderedQty: order.qty, dispatchedQty: qty, batchId: batch.id },
      raisedBy: dispatchedBy,
    });
  }
  const updated = await getProductionOrder(id);
  return { ok: true, order: updated ?? undefined, batchId: batch.id, escalated };
}

export { OPEN as OPEN_PRODUCTION_STATUSES };
