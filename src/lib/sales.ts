import { db } from "./db";
import { decrementQuery } from "./catalog";
import { createReceivable } from "./receivables";
import { checkReorder } from "./production";
import { dateOnly, isoString } from "./db-dates";

export interface SalesLine {
  slug: string;
  name: string;
  qty: number;
  unitPriceEgp: number;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "expired" | "converted";
export interface Quotation {
  id: number;
  companyId: number | null;
  companyName: string;
  status: QuotationStatus;
  validUntil: string | null;
  notes: string;
  totalEgp: number;
  createdAt: string;
}
export interface QuotationDetail extends Quotation {
  lines: SalesLine[];
}

export type POStatus = "open" | "fulfilled" | "invoiced" | "closed" | "cancelled";
export interface PurchaseOrder {
  id: number;
  companyId: number | null;
  companyName: string;
  quotationId: number | null;
  status: POStatus;
  totalEgp: number;
  notes: string;
  fulfilled: boolean;
  /** Finance has released this PO to the warehouse for dispatch to the client. */
  dispatchRequested: boolean;
  /** When Finance released the goods to the warehouse (Product Release Form). */
  dispatchReleasedAt: string | null;
  /** Finance's authorization note on the release form. */
  dispatchReleaseNote: string;
  /** Name of the Finance user who released the goods (for the release form). */
  releasedByName: string | null;
  receivableId: number | null;
  /** When the invoice was marked sent to the client (post-invoice lifecycle). */
  invoiceSentAt: string | null;
  createdAt: string;
}
export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: SalesLine[];
  /** Payment progress on the linked receivable (drives the "payment received" gate). */
  receivablePaidEgp: number;
  receivableStatus: string | null;
  /** Overall due date from the linked receivable. */
  dueDate: string | null;
}

const lineTotal = (lines: SalesLine[]) =>
  lines.reduce((s, l) => s + Math.round(l.unitPriceEgp) * Math.round(l.qty), 0);

/* ---------- quotations ---------- */

export async function createQuotation(
  input: { companyId: number | null; companyName: string; validUntil: string | null; notes: string; lines: SalesLine[] },
  createdBy: number | null
): Promise<QuotationDetail> {
  const total = lineTotal(input.lines);
  const slugs = input.lines.map((l) => l.slug);
  const names = input.lines.map((l) => l.name);
  const qtys = input.lines.map((l) => Math.round(l.qty));
  const prices = input.lines.map((l) => Math.round(l.unitPriceEgp));
  const rows = (await db()`
    WITH q AS (
      INSERT INTO quotations (company_id, company_name, valid_until, notes, total_egp, created_by)
      VALUES (${input.companyId}, ${input.companyName}, ${input.validUntil}, ${input.notes}, ${total}, ${createdBy})
      RETURNING id
    ),
    l AS (
      INSERT INTO quotation_lines (quotation_id, slug, name, qty, unit_price_egp)
      SELECT q.id, t.slug, t.name, t.qty, t.price
      FROM q, unnest(${slugs}::text[], ${names}::text[], ${qtys}::int[], ${prices}::int[]) AS t(slug, name, qty, price)
      RETURNING 1
    )
    SELECT id FROM q
  `) as { id: number }[];
  const id = Number(rows[0].id);
  return (await getQuotation(id))!;
}

export async function listQuotations(): Promise<Quotation[]> {
  const rows = (await db()`SELECT * FROM quotations ORDER BY created_at DESC LIMIT 200`) as Record<string, unknown>[];
  return rows.map(toQuotation);
}
export async function getQuotation(id: number): Promise<QuotationDetail | null> {
  const rows = (await db()`SELECT * FROM quotations WHERE id = ${id}`) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const lines = (await db()`SELECT * FROM quotation_lines WHERE quotation_id = ${id} ORDER BY id`) as Record<string, unknown>[];
  return { ...toQuotation(rows[0]), lines: lines.map(toLine) };
}
export async function setQuotationStatus(id: number, status: QuotationStatus): Promise<void> {
  await db()`UPDATE quotations SET status = ${status}, updated_at = now() WHERE id = ${id}`;
}

function toLine(r: Record<string, unknown>): SalesLine {
  return { slug: String(r.slug), name: String(r.name), qty: Number(r.qty), unitPriceEgp: Number(r.unit_price_egp) };
}
function toQuotation(r: Record<string, unknown>): Quotation {
  return {
    id: Number(r.id), companyId: r.company_id === null ? null : Number(r.company_id),
    companyName: String(r.company_name), status: r.status as QuotationStatus,
    validUntil: dateOnly(r.valid_until), notes: String(r.notes),
    totalEgp: Number(r.total_egp), createdAt: isoString(r.created_at),
  };
}

/* ---------- purchase orders ---------- */

export async function createPurchaseOrder(
  input: { companyId: number | null; companyName: string; quotationId: number | null; notes: string; lines: SalesLine[] },
  createdBy: number | null
): Promise<PurchaseOrderDetail> {
  const total = lineTotal(input.lines);
  const slugs = input.lines.map((l) => l.slug);
  const names = input.lines.map((l) => l.name);
  const qtys = input.lines.map((l) => Math.round(l.qty));
  const prices = input.lines.map((l) => Math.round(l.unitPriceEgp));
  const rows = (await db()`
    WITH po AS (
      INSERT INTO purchase_orders (company_id, company_name, quotation_id, notes, total_egp, created_by)
      VALUES (${input.companyId}, ${input.companyName}, ${input.quotationId}, ${input.notes}, ${total}, ${createdBy})
      RETURNING id
    ),
    l AS (
      INSERT INTO purchase_order_lines (po_id, slug, name, qty, unit_price_egp)
      SELECT po.id, t.slug, t.name, t.qty, t.price
      FROM po, unnest(${slugs}::text[], ${names}::text[], ${qtys}::int[], ${prices}::int[]) AS t(slug, name, qty, price)
      RETURNING 1
    )
    SELECT id FROM po
  `) as { id: number }[];
  const id = Number(rows[0].id);
  if (input.quotationId) await setQuotationStatus(input.quotationId, "converted");
  return (await getPurchaseOrder(id))!;
}

export async function listPurchaseOrders(openOnly = false): Promise<PurchaseOrder[]> {
  const rows = openOnly
    ? ((await db()`SELECT * FROM purchase_orders WHERE status = 'open' ORDER BY created_at DESC LIMIT 200`) as Record<string, unknown>[])
    : ((await db()`SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT 200`) as Record<string, unknown>[]);
  return rows.map(toPO);
}
/** POs Finance can still act on: not yet dispatched (fulfilled) and not cancelled. */
export async function listProcessablePurchaseOrders(): Promise<PurchaseOrder[]> {
  const rows = (await db()`
    SELECT * FROM purchase_orders
    WHERE fulfilled = FALSE AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 200
  `) as Record<string, unknown>[];
  return rows.map(toPO);
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrderDetail | null> {
  const rows = (await db()`
    SELECT po.*, u.name AS released_by_name
    FROM purchase_orders po
    LEFT JOIN users u ON u.id = po.dispatch_released_by
    WHERE po.id = ${id}
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const lines = (await db()`SELECT * FROM purchase_order_lines WHERE po_id = ${id} ORDER BY id`) as Record<string, unknown>[];
  const base = toPO(rows[0]);

  // Pull payment progress + due date from the linked receivable (gates release).
  let receivablePaidEgp = 0, receivableStatus: string | null = null, dueDate: string | null = null;
  if (base.receivableId) {
    const rr = (await db()`
      SELECT r.status, r.due_date,
             COALESCE((SELECT SUM(amount_egp) FROM receivable_payments WHERE receivable_id = r.id), 0)::int AS paid
      FROM receivables r WHERE r.id = ${base.receivableId}
    `) as { status: string; due_date: string | null; paid: number }[];
    if (rr[0]) {
      receivablePaidEgp = Number(rr[0].paid);
      receivableStatus = rr[0].status;
      dueDate = rr[0].due_date ? String(rr[0].due_date) : null;
    }
  }
  return { ...base, lines: lines.map(toLine), receivablePaidEgp, receivableStatus, dueDate };
}

function toPO(r: Record<string, unknown>): PurchaseOrder {
  return {
    id: Number(r.id), companyId: r.company_id === null ? null : Number(r.company_id),
    companyName: String(r.company_name), quotationId: r.quotation_id === null ? null : Number(r.quotation_id),
    status: r.status as POStatus, totalEgp: Number(r.total_egp), notes: String(r.notes),
    fulfilled: Boolean(r.fulfilled), dispatchRequested: Boolean(r.dispatch_requested),
    dispatchReleasedAt: r.dispatch_released_at ? isoString(r.dispatch_released_at) : null,
    dispatchReleaseNote: r.dispatch_release_note ? String(r.dispatch_release_note) : "",
    releasedByName: r.released_by_name ? String(r.released_by_name) : null,
    receivableId: r.receivable_id === null ? null : Number(r.receivable_id),
    invoiceSentAt: r.invoice_sent_at ? isoString(r.invoice_sent_at) : null,
    createdAt: isoString(r.created_at),
  };
}

/** Mark an invoiced PO's invoice as sent to the client. */
export async function markInvoiceSent(id: number): Promise<PurchaseOrderDetail | null> {
  await db()`
    UPDATE purchase_orders SET invoice_sent_at = now(), updated_at = now()
    WHERE id = ${id} AND receivable_id IS NOT NULL
  `;
  return getPurchaseOrder(id);
}

export type ReleaseResult =
  | { ok: true; po: PurchaseOrderDetail }
  | { ok: false; reason: "not_found" | "not_invoiced" | "already_fulfilled" };

/**
 * Finance → warehouse handoff (Product Release Form): Finance releases an
 * INVOICED PO's goods to the warehouse for dispatch to the client. Records who
 * released it, when, and an optional authorization note. Gated on invoicing —
 * goods aren't released to the floor until the sale has been invoiced.
 */
export async function releaseToWarehouse(
  id: number,
  note: string,
  releasedBy: number | null,
  proofUrl = ""
): Promise<ReleaseResult> {
  const po = await getPurchaseOrder(id);
  if (!po) return { ok: false, reason: "not_found" };
  if (po.fulfilled) return { ok: false, reason: "already_fulfilled" };
  if (!po.receivableId) return { ok: false, reason: "not_invoiced" };
  await db()`
    UPDATE purchase_orders
    SET dispatch_requested = TRUE,
        dispatch_released_at = now(),
        dispatch_released_by = ${releasedBy},
        dispatch_release_note = ${note},
        dispatch_release_proof_url = ${proofUrl},
        updated_at = now()
    WHERE id = ${id}
  `;
  return { ok: true, po: (await getPurchaseOrder(id))! };
}

/** POs Finance has sent for dispatch that the warehouse hasn't dispatched yet. */
export async function listDispatchQueue(): Promise<PurchaseOrder[]> {
  const rows = (await db()`
    SELECT * FROM purchase_orders
    WHERE dispatch_requested = TRUE AND fulfilled = FALSE AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 200
  `) as Record<string, unknown>[];
  return rows.map(toPO);
}

/** Deduct stock for a PO's lines and flag it fulfilled. */
export async function fulfilPurchaseOrder(id: number): Promise<PurchaseOrderDetail | null> {
  const po = await getPurchaseOrder(id);
  if (!po || po.fulfilled) return po;
  const nextStatus: POStatus = po.status === "invoiced" ? "closed" : po.status === "open" ? "fulfilled" : po.status;
  // Deduct every line's stock AND flip status in ONE transaction — a crash
  // can't leave some stock deducted with the PO still marked unfulfilled.
  const queries = po.lines
    .filter((l) => l.qty > 0)
    .map((l) => decrementQuery(l.slug, l.qty));
  queries.push(db()`UPDATE purchase_orders SET fulfilled = TRUE, status = ${nextStatus}, updated_at = now() WHERE id = ${id}`);
  await db().transaction(queries);
  // Stock dropped — auto-raise factory production orders for anything now low.
  await checkReorder(po.lines.map((l) => l.slug));
  return getPurchaseOrder(id);
}

/** Raise a receivable for a PO (advance/installments optional) and link it. */
export async function invoicePurchaseOrder(
  id: number,
  opts: {
    advanceEgp?: number;
    advanceMethod?: string;
    advanceProofUrl?: string;
    installments?: { amountEgp: number; dueDate?: string | null }[];
    installmentCount?: number;
    dueDate?: string | null;
    firstDueDate?: string | null;
  },
  invoicedBy: number | null
): Promise<PurchaseOrderDetail | null> {
  const po = await getPurchaseOrder(id);
  if (!po || po.receivableId) return po;
  const rec = await createReceivable(
    {
      companyId: po.companyId, companyName: po.companyName, orderRef: `PO-${po.id}`,
      totalEgp: po.totalEgp, dueDate: opts.dueDate ?? null, notes: `From purchase order #${po.id}`,
      advance: opts.advanceEgp && opts.advanceEgp > 0 ? { amountEgp: opts.advanceEgp, method: opts.advanceMethod ?? "bank_transfer", proofUrl: opts.advanceProofUrl ?? "" } : undefined,
      installments: opts.installments,
      installmentCount: opts.installmentCount, firstDueDate: opts.firstDueDate ?? null,
    },
    invoicedBy
  );
  const nextStatus: POStatus = po.fulfilled ? "closed" : "invoiced";
  await db()`UPDATE purchase_orders SET receivable_id = ${rec.id}, status = ${nextStatus}, updated_at = now() WHERE id = ${id}`;
  return getPurchaseOrder(id);
}

/**
 * Sales summary for the last `days` from PURCHASE ORDERS (the order book) —
 * revenue, order count and top products. Excludes cancelled POs. Used by the
 * sales report (replacing the retired storefront-orders source).
 */
export async function purchaseOrderSalesSummary(days: number): Promise<{
  revenueEgp: number;
  orderCount: number;
  topProducts: { name: string; qty: number }[];
}> {
  const head = (await db()`
    SELECT COALESCE(SUM(total_egp),0)::int AS revenue, COUNT(*)::int AS n
    FROM purchase_orders
    WHERE status <> 'cancelled' AND created_at >= now() - make_interval(days => ${days})
  `) as { revenue: number; n: number }[];
  const top = (await db()`
    SELECT l.name AS name, SUM(l.qty)::int AS qty
    FROM purchase_order_lines l JOIN purchase_orders po ON po.id = l.po_id
    WHERE po.status <> 'cancelled' AND po.created_at >= now() - make_interval(days => ${days})
    GROUP BY l.name ORDER BY qty DESC LIMIT 5
  `) as { name: string; qty: number }[];
  return {
    revenueEgp: Number(head[0]?.revenue ?? 0),
    orderCount: Number(head[0]?.n ?? 0),
    topProducts: top.map((r) => ({ name: r.name, qty: Number(r.qty) })),
  };
}
