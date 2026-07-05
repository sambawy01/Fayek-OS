import { db } from "./db";
import { decrementQuantities } from "./catalog";
import { createReceivable } from "./receivables";

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
  receivableId: number | null;
  createdAt: string;
}
export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: SalesLine[];
}

const lineTotal = (lines: SalesLine[]) =>
  lines.reduce((s, l) => s + Math.round(l.unitPriceEgp) * Math.round(l.qty), 0);

/* ---------- quotations ---------- */

export async function createQuotation(
  input: { companyId: number | null; companyName: string; validUntil: string | null; notes: string; lines: SalesLine[] },
  createdBy: number | null
): Promise<QuotationDetail> {
  const total = lineTotal(input.lines);
  const rows = (await db()`
    INSERT INTO quotations (company_id, company_name, valid_until, notes, total_egp, created_by)
    VALUES (${input.companyId}, ${input.companyName}, ${input.validUntil}, ${input.notes}, ${total}, ${createdBy})
    RETURNING id
  `) as { id: number }[];
  const id = Number(rows[0].id);
  for (const l of input.lines) {
    await db()`
      INSERT INTO quotation_lines (quotation_id, slug, name, qty, unit_price_egp)
      VALUES (${id}, ${l.slug}, ${l.name}, ${Math.round(l.qty)}, ${Math.round(l.unitPriceEgp)})
    `;
  }
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
    validUntil: (r.valid_until as string | null) ?? null, notes: String(r.notes),
    totalEgp: Number(r.total_egp), createdAt: String(r.created_at),
  };
}

/* ---------- purchase orders ---------- */

export async function createPurchaseOrder(
  input: { companyId: number | null; companyName: string; quotationId: number | null; notes: string; lines: SalesLine[] },
  createdBy: number | null
): Promise<PurchaseOrderDetail> {
  const total = lineTotal(input.lines);
  const rows = (await db()`
    INSERT INTO purchase_orders (company_id, company_name, quotation_id, notes, total_egp, created_by)
    VALUES (${input.companyId}, ${input.companyName}, ${input.quotationId}, ${input.notes}, ${total}, ${createdBy})
    RETURNING id
  `) as { id: number }[];
  const id = Number(rows[0].id);
  for (const l of input.lines) {
    await db()`
      INSERT INTO purchase_order_lines (po_id, slug, name, qty, unit_price_egp)
      VALUES (${id}, ${l.slug}, ${l.name}, ${Math.round(l.qty)}, ${Math.round(l.unitPriceEgp)})
    `;
  }
  if (input.quotationId) await setQuotationStatus(input.quotationId, "converted");
  return (await getPurchaseOrder(id))!;
}

export async function listPurchaseOrders(openOnly = false): Promise<PurchaseOrder[]> {
  const rows = openOnly
    ? ((await db()`SELECT * FROM purchase_orders WHERE status = 'open' ORDER BY created_at DESC LIMIT 200`) as Record<string, unknown>[])
    : ((await db()`SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT 200`) as Record<string, unknown>[]);
  return rows.map(toPO);
}
export async function getPurchaseOrder(id: number): Promise<PurchaseOrderDetail | null> {
  const rows = (await db()`SELECT * FROM purchase_orders WHERE id = ${id}`) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const lines = (await db()`SELECT * FROM purchase_order_lines WHERE po_id = ${id} ORDER BY id`) as Record<string, unknown>[];
  return { ...toPO(rows[0]), lines: lines.map(toLine) };
}

function toPO(r: Record<string, unknown>): PurchaseOrder {
  return {
    id: Number(r.id), companyId: r.company_id === null ? null : Number(r.company_id),
    companyName: String(r.company_name), quotationId: r.quotation_id === null ? null : Number(r.quotation_id),
    status: r.status as POStatus, totalEgp: Number(r.total_egp), notes: String(r.notes),
    fulfilled: Boolean(r.fulfilled), receivableId: r.receivable_id === null ? null : Number(r.receivable_id),
    createdAt: String(r.created_at),
  };
}

/** Deduct stock for a PO's lines and flag it fulfilled. */
export async function fulfilPurchaseOrder(id: number): Promise<PurchaseOrderDetail | null> {
  const po = await getPurchaseOrder(id);
  if (!po || po.fulfilled) return po;
  await decrementQuantities(po.lines.map((l) => ({ slug: l.slug, qty: l.qty })));
  const nextStatus: POStatus = po.status === "invoiced" ? "closed" : po.status === "open" ? "fulfilled" : po.status;
  await db()`UPDATE purchase_orders SET fulfilled = TRUE, status = ${nextStatus}, updated_at = now() WHERE id = ${id}`;
  return getPurchaseOrder(id);
}

/** Raise a receivable for a PO (advance/installments optional) and link it. */
export async function invoicePurchaseOrder(
  id: number,
  opts: {
    advanceEgp?: number;
    advanceMethod?: string;
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
      advance: opts.advanceEgp && opts.advanceEgp > 0 ? { amountEgp: opts.advanceEgp, method: opts.advanceMethod ?? "cash" } : undefined,
      installments: opts.installments,
      installmentCount: opts.installmentCount, firstDueDate: opts.firstDueDate ?? null,
    },
    invoicedBy
  );
  const nextStatus: POStatus = po.fulfilled ? "closed" : "invoiced";
  await db()`UPDATE purchase_orders SET receivable_id = ${rec.id}, status = ${nextStatus}, updated_at = now() WHERE id = ${id}`;
  return getPurchaseOrder(id);
}
