"use client";

import { useEffect, useRef, useState } from "react";
import type { PnL } from "@/lib/finance-report";
import type { LedgerEntry, LedgerDirection } from "@/lib/finance";

/**
 * Finance manager — the owner's private ledger + live P&L inside /admin.
 *
 * - Month selector drives a GET /api/admin/finance?month=YYYY-MM that returns
 *   the P&L (summary numbers AND the in-range manual entries) in one fetch.
 * - Summary cards: Revenue (split shop / manual) · Expenses · Net.
 * - Entries table with add / edit / delete; the add/edit form uploads a
 *   receipt photo via the existing /api/admin/media route.
 * - Export CSV + Generate P&L PDF download the current month's documents.
 *
 * Auth mirrors products-section: legacy ?key= flows down as x-admin-key;
 * Basic auth re-attaches automatically to same-origin fetches.
 *
 * The category constants are duplicated here (not imported from @/lib/finance)
 * because that module pulls in the Vercel Blob SDK — exactly the reason
 * products-section re-declares its sold-out rule locally.
 */

const EXPENSE_CATEGORIES = [
  "rent",
  "supplies",
  "product-stock",
  "marketing",
  "salaries",
  "utilities",
  "bank-fees",
  "other",
] as const;
const INCOME_CATEGORIES = ["cash-sale", "gift-card", "other"] as const;
const PAYMENT_METHODS = ["cash", "bank-transfer", "card", "other"] as const;

const SITE_BASE = "https://www.fayekabrasives.com/";

/* ---------- helpers ---------- */

function authHeaders(adminKey: string): Record<string, string> {
  return adminKey ? { "x-admin-key": adminKey } : {};
}

async function readError(res: Response): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    fields?: Record<string, string>;
  } | null;
  if (payload?.fields) {
    const first = Object.values(payload.fields)[0];
    if (first) return first;
  }
  if (payload?.error) return payload.error;
  return `Request failed (${res.status})`;
}

function egp(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} EGP`;
}

function categoriesFor(direction: LedgerDirection): readonly string[] {
  return direction === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

function photoSrc(url: string): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : SITE_BASE + url;
}

/** Current Cairo month as YYYY-MM. */
function currentCairoMonth(): string {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return key.slice(0, 7);
}

function labelCategory(c: string): string {
  return c.replace(/-/g, " ");
}

function labelMethod(m: string): string {
  return m.replace(/-/g, " ");
}

/* ---------- shared styles ---------- */

const inputCls =
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]";
const buttonBase =
  "rounded-full px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50";
const primaryBtn = `${buttonBase} bg-[#1668C7] text-[#F4F8FD] hover:opacity-90`;
const subtleBtn = `${buttonBase} border border-[#0E2A47]/15 bg-[#F4F8FD] text-[#0E2A47] hover:bg-[#E4EEFA]`;
const dangerBtn = `${buttonBase} border border-[#CC4038]/30 bg-[#F4F8FD] text-[#CC4038] hover:bg-[#CC4038]/5`;

/* ---------- summary cards ---------- */

function SummaryCards({ pnl }: { pnl: PnL }) {
  const netCls = (n: number) =>
    n >= 0 ? "bg-[#1668C7]/10 border-[#1668C7]/25 text-[#1668C7]" : "bg-[#CC4038]/10 border-[#CC4038]/25 text-[#CC4038]";
  const cards = [
    {
      label: "Gross profit",
      value: egp(pnl.grossProfitEgp),
      cls: "bg-[#357F75]/10 border-[#357F75]/25 text-[#357F75]",
      sub: [`Invoiced ${egp(pnl.invoicedRevenueEgp)}`, `COGS ${egp(pnl.cogsEgp)}`],
    },
    {
      label: "Revenue",
      value: egp(pnl.revenue.totalEgp),
      cls: "bg-[#5B7186]/10 border-[#5B7186]/25 text-[#3B5578]",
      sub: [`Sales settled ${egp(pnl.revenue.shopEgp)}`, `Other ${egp(pnl.revenue.manualIncomeEgp)}`],
    },
    {
      label: "Expenses",
      value: egp(pnl.expenses.totalEgp),
      cls: "bg-[#CC4038]/10 border-[#CC4038]/25 text-[#CC4038]",
      sub: pnl.expenses.byCategory.slice(0, 3).map((c) => `${labelCategory(c.category)} ${egp(c.amountEgp)}`),
    },
    {
      label: pnl.netAccrualEgp >= 0 ? "Net profit" : "Net loss",
      value: egp(Math.abs(pnl.netAccrualEgp)),
      cls: netCls(pnl.netAccrualEgp),
      sub: [`Cash basis ${egp(pnl.netCashEgp)}`, `${pnl.counts.revenueOrders} payments received`],
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-2xl border px-4 py-4 ${card.cls}`}>
            <p className="text-xs font-medium uppercase tracking-[0.1em] opacity-80">{card.label}</p>
            <p className="mt-1 font-serif text-2xl">{card.value}</p>
            <div className="mt-2 space-y-0.5">
              {card.sub.map((s) => (
                <p key={s} className="text-xs opacity-80">{s}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-2">
          <p className="text-xs uppercase tracking-[0.06em] text-[#5B7186]">Net VAT</p>
          <p className="font-medium text-[#0E2A47]">{egp(pnl.vat.netEgp)}</p>
        </div>
        <div className="rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-2">
          <p className="text-xs uppercase tracking-[0.06em] text-[#5B7186]">Input VAT</p>
          <p className="font-medium text-[#0E2A47]">{egp(pnl.vat.inputEgp)}</p>
        </div>
        <div className="rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-2">
          <p className="text-xs uppercase tracking-[0.06em] text-[#5B7186]">Output VAT</p>
          <p className="font-medium text-[#0E2A47]">{egp(pnl.vat.outputEgp)}</p>
        </div>
        <div className="rounded-xl border border-[#D6941F]/25 bg-[#D6941F]/10 px-3 py-2">
          <p className="text-xs uppercase tracking-[0.06em] text-[#8A5A12]">Payables owed</p>
          <p className="font-medium text-[#8A5A12]">{egp(pnl.payables.totalEgp)}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- entry form (add / edit) ---------- */

const PAYMENT_STATUSES = ["paid", "unpaid", "partial"] as const;
const RECUR_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;

/**
 * Advance a YYYY-MM-DD date by one recurrence step (mirrors
 * finance.advanceRecurDate — kept local because @/lib/finance pulls in the Blob
 * SDK). The entry's own date is occurrence #1 (the saved row), so the template's
 * nextDate must be the NEXT period, or the cron would materialize a duplicate of
 * the first occurrence and double-count it in the P&L.
 */
function advanceRecurDate(date: string, freq: (typeof RECUR_FREQUENCIES)[number]): string {
  const [y, m, d] = date.split("-").map(Number);
  if (freq === "weekly") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const add = freq === "monthly" ? 1 : freq === "quarterly" ? 3 : 12;
  let month = m + add;
  const year = y + Math.floor((month - 1) / 12);
  month = ((month - 1) % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface LineItemForm {
  description: string;
  qty: string;
  unitPriceEgp: string;
  slug: string;
}

interface FormState {
  date: string;
  direction: LedgerDirection;
  category: string;
  amountEgp: string;
  method: string;
  note: string;
  receiptUrl: string;
  // Standard bookkeeping fields.
  vendor: string;
  reference: string;
  taxRatePct: string;
  taxExclusive: boolean; // when true, the entered amount is NET; VAT adds on top
  paymentStatus: (typeof PAYMENT_STATUSES)[number];
  amountPaidEgp: string;
  dueDate: string;
  costCenter: string;
  currency: string;
  lineItems: LineItemForm[];
  linkPoId: string;
  linkSlug: string;
  linkBatchId: string;
  recurringOn: boolean;
  recurringFreq: (typeof RECUR_FREQUENCIES)[number];
}

function toFormState(entry: LedgerEntry | null, month: string): FormState {
  const base = {
    vendor: entry?.vendor ?? "",
    reference: entry?.reference ?? "",
    taxRatePct: entry?.taxRatePct !== undefined ? String(entry.taxRatePct) : "0",
    taxExclusive: false,
    paymentStatus: (entry?.paymentStatus ?? "paid") as (typeof PAYMENT_STATUSES)[number],
    amountPaidEgp: entry?.amountPaidEgp !== undefined ? String(entry.amountPaidEgp) : "",
    dueDate: entry?.dueDate ?? "",
    costCenter: entry?.costCenter ?? "",
    currency: entry?.currency ?? "EGP",
    lineItems: (entry?.lineItems ?? []).map((l) => ({
      description: l.description, qty: String(l.qty), unitPriceEgp: String(l.unitPriceEgp), slug: l.slug ?? "",
    })),
    linkPoId: entry?.links?.poId !== undefined ? String(entry.links.poId) : "",
    linkSlug: entry?.links?.slug ?? "",
    linkBatchId: entry?.links?.batchId !== undefined ? String(entry.links.batchId) : "",
    recurringOn: Boolean(entry?.recurring?.active),
    recurringFreq: (entry?.recurring?.frequency ?? "monthly") as (typeof RECUR_FREQUENCIES)[number],
  };
  if (entry) {
    return {
      date: entry.date,
      direction: entry.direction,
      category: entry.category,
      amountEgp: String(entry.amountEgp),
      method: entry.method,
      note: entry.note,
      receiptUrl: entry.receiptUrl ?? "",
      ...base,
    };
  }
  // Default new-entry date: today if it falls in the selected month, else the
  // first of that month.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    date: today.startsWith(month) ? today : `${month}-01`,
    direction: "expense",
    category: "supplies",
    amountEgp: "",
    method: "cash",
    note: "",
    receiptUrl: "",
    ...base,
  };
}

/** Gross/net/VAT from a form: line-item subtotal (if any) or the entered amount, with the VAT rate. */
function deriveMoney(form: FormState): { subtotal: number; vat: number; gross: number } {
  const rate = Math.max(0, Number(form.taxRatePct) || 0);
  const hasLines = form.lineItems.length > 0;
  let netOrEntered: number;
  if (hasLines) {
    netOrEntered = form.lineItems.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPriceEgp) || 0), 0);
  } else {
    netOrEntered = Number(form.amountEgp) || 0;
  }
  // Line items and the "excludes VAT" toggle both mean the figure is NET.
  const isNet = hasLines || form.taxExclusive;
  let subtotal: number, gross: number;
  if (isNet) {
    subtotal = netOrEntered;
    gross = Math.round(subtotal * (1 + rate / 100) * 100) / 100;
  } else {
    gross = netOrEntered;
    subtotal = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  }
  return { subtotal, vat: Math.round((gross - subtotal) * 100) / 100, gross };
}

function EntryForm({
  entry,
  month,
  adminKey,
  onSaved,
  onCancel,
}: {
  entry: LedgerEntry | null;
  month: string;
  adminKey: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(entry, month));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const money = deriveMoney(form);
  const hasLines = form.lineItems.length > 0;
  const addLine = () =>
    set({ lineItems: [...form.lineItems, { description: "", qty: "1", unitPriceEgp: "", slug: "" }] });
  const updLine = (i: number, patch: Partial<LineItemForm>) =>
    set({ lineItems: form.lineItems.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const rmLine = (i: number) =>
    set({ lineItems: form.lineItems.filter((_, idx) => idx !== i) });

  function changeDirection(direction: LedgerDirection) {
    // Keep the chosen category valid for the new direction.
    const cats = categoriesFor(direction);
    set({
      direction,
      category: cats.includes(form.category) ? form.category : cats[0],
    });
  }

  async function uploadReceipt(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Only JPEG, PNG or WebP images are allowed.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image must be at most 4 MB.");
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: authHeaders(adminKey),
        body: data,
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const payload = (await res.json()) as { url: string };
      set({ receiptUrl: payload.url });
    } catch {
      setError("Upload failed — network error.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    setError(null);
    const money = deriveMoney(form);
    if (!(money.gross > 0)) {
      setError(form.lineItems.length ? "Line items must total a positive amount." : "Amount must be a positive number.");
      return;
    }
    if (form.paymentStatus === "partial") {
      const paid = Number(form.amountPaidEgp);
      if (!Number.isFinite(paid) || paid <= 0 || paid > money.gross) {
        setError("For a partial payment, enter an amount paid between 0 and the total.");
        return;
      }
    }
    if ((form.paymentStatus === "unpaid" || form.paymentStatus === "partial") && !form.dueDate) {
      setError("Unpaid / partial entries need a due date.");
      return;
    }

    const rate = Math.max(0, Number(form.taxRatePct) || 0);
    const links: Record<string, number | string> = {};
    if (form.linkPoId.trim()) links.poId = Number(form.linkPoId);
    if (form.linkBatchId.trim()) links.batchId = Number(form.linkBatchId);
    if (form.linkSlug.trim()) links.slug = form.linkSlug.trim();

    const body: Record<string, unknown> = {
      date: form.date,
      direction: form.direction,
      category: form.category,
      amountEgp: money.gross, // always gross cash
      method: form.method,
      note: form.note.trim(),
      receiptUrl: form.receiptUrl.trim() || null,
      vendor: form.vendor.trim(),
      reference: form.reference.trim(),
      taxRatePct: rate,
      paymentStatus: form.paymentStatus,
      costCenter: form.costCenter.trim(),
      currency: form.currency.trim().toUpperCase() || "EGP",
      dueDate: form.dueDate || null,
      ...(form.paymentStatus === "partial" ? { amountPaidEgp: Number(form.amountPaidEgp) } : {}),
      ...(form.lineItems.length
        ? { lineItems: form.lineItems.map((l) => ({
            description: l.description.trim(), qty: Number(l.qty), unitPriceEgp: Number(l.unitPriceEgp),
            ...(l.slug.trim() ? { slug: l.slug.trim() } : {}),
          })) }
        : {}),
      ...(Object.keys(links).length ? { links } : {}),
      recurring: form.recurringOn
        ? { frequency: form.recurringFreq, nextDate: advanceRecurDate(form.date, form.recurringFreq), active: true }
        : null,
    };

    setBusy(true);
    try {
      const res = await fetch(
        entry
          ? `/api/admin/finance/${encodeURIComponent(entry.id)}`
          : "/api/admin/finance",
        {
          method: entry ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(adminKey) },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      onSaved();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const cats = categoriesFor(form.direction);

  return (
    <div className="rounded-2xl border border-[#1668C7]/25 bg-[#F4F8FD] px-5 py-5 shadow-sm">
      <h3 className="font-serif text-xl text-[#0E2A47]">
        {entry ? "Edit entry" : "Add entry"}
      </h3>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Type</label>
          <select
            className={inputCls}
            value={form.direction}
            onChange={(e) => changeDirection(e.target.value as LedgerDirection)}
          >
            <option value="expense">Expense</option>
            <option value="income">Income (cash / off-platform)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select
            className={inputCls}
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {labelCategory(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Amount (EGP) {hasLines && <span className="font-normal text-[#5B7186]">— from line items</span>}</label>
          <input
            className={inputCls}
            inputMode="decimal"
            value={hasLines ? String(money.subtotal) : form.amountEgp}
            placeholder="0"
            disabled={hasLines}
            onChange={(e) => set({ amountEgp: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Method</label>
          <select
            className={inputCls}
            value={form.method}
            onChange={(e) => set({ method: e.target.value })}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {labelMethod(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input
            className={inputCls}
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input
            className={inputCls}
            value={form.note}
            placeholder="e.g. Onmacabim restock"
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>
      </div>

      {/* Counterparty + reference */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{form.direction === "expense" ? "Vendor / payee" : "Customer"} (optional)</label>
          <input className={inputCls} value={form.vendor} placeholder="e.g. Onmacabim Ltd" onChange={(e) => set({ vendor: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Reference / invoice no. (optional)</label>
          <input className={inputCls} value={form.reference} placeholder="e.g. INV-2043" onChange={(e) => set({ reference: e.target.value })} />
        </div>
      </div>

      {/* VAT */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>VAT rate (%)</label>
          <input className={inputCls} inputMode="decimal" value={form.taxRatePct} onChange={(e) => set({ taxRatePct: e.target.value })} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-[#0E2A47]">
            <input type="checkbox" checked={form.taxExclusive} disabled={hasLines} onChange={(e) => set({ taxExclusive: e.target.checked })} />
            Amount excludes VAT (add it on top)
          </label>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#5B7186]">
        Net {egp(money.subtotal)} · VAT {egp(money.vat)} · <span className="font-medium text-[#0E2A47]">Gross {egp(money.gross)}</span>
      </p>

      {/* Payment status */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Payment status</label>
          <select className={inputCls} value={form.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value as FormState["paymentStatus"] })}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {form.paymentStatus === "partial" && (
          <div>
            <label className={labelCls}>Amount paid (EGP)</label>
            <input className={inputCls} inputMode="decimal" value={form.amountPaidEgp} onChange={(e) => set({ amountPaidEgp: e.target.value })} />
          </div>
        )}
        {(form.paymentStatus === "unpaid" || form.paymentStatus === "partial") && (
          <div>
            <label className={labelCls}>Due date</label>
            <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className={labelCls + " mb-0"}>Line items (optional)</label>
          <button type="button" onClick={addLine} className="text-xs font-medium text-[#1668C7] underline">+ add line</button>
        </div>
        {form.lineItems.map((l, i) => (
          <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_7rem_8rem_auto]">
            <input className={inputCls} placeholder="Description" value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} />
            <input className={inputCls} inputMode="decimal" placeholder="Qty" value={l.qty} onChange={(e) => updLine(i, { qty: e.target.value })} />
            <input className={inputCls} inputMode="decimal" placeholder="Unit EGP" value={l.unitPriceEgp} onChange={(e) => updLine(i, { unitPriceEgp: e.target.value })} />
            <input className={inputCls} placeholder="Product slug" value={l.slug} onChange={(e) => updLine(i, { slug: e.target.value })} />
            <button type="button" onClick={() => rmLine(i)} className="text-sm text-[#CC4038]">✕</button>
          </div>
        ))}
      </div>

      {/* Links + tags */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Link PO id (optional)</label>
          <input className={inputCls} inputMode="numeric" value={form.linkPoId} onChange={(e) => set({ linkPoId: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Link batch id (optional)</label>
          <input className={inputCls} inputMode="numeric" value={form.linkBatchId} onChange={(e) => set({ linkBatchId: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Cost center / project (optional)</label>
          <input className={inputCls} value={form.costCenter} onChange={(e) => set({ costCenter: e.target.value })} />
        </div>
      </div>

      {/* Currency + recurring */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Currency</label>
          <input className={inputCls} value={form.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-[#0E2A47]">
            <input type="checkbox" checked={form.recurringOn} onChange={(e) => set({ recurringOn: e.target.checked })} />
            Recurring
          </label>
        </div>
        {form.recurringOn && (
          <div>
            <label className={labelCls}>Frequency</label>
            <select className={inputCls} value={form.recurringFreq} onChange={(e) => set({ recurringFreq: e.target.value as FormState["recurringFreq"] })}>
              {RECUR_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className={labelCls}>Receipt photo (optional)</label>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm text-[#5B7186] file:mr-3 file:rounded-full file:border-0 file:bg-[#0E2A47]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#0E2A47]"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadReceipt(file);
            }}
          />
          {uploading && <span className="text-sm text-[#5B7186]">Uploading…</span>}
        </div>
        {form.receiptUrl && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc(form.receiptUrl)}
              alt="Receipt preview"
              className="h-20 w-20 rounded-xl border border-[#0E2A47]/10 object-cover"
            />
            <button
              type="button"
              onClick={() => set({ receiptUrl: "" })}
              className="text-sm text-[#CC4038] underline"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-[#CC4038]">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={busy || uploading} onClick={() => void submit()} className={primaryBtn}>
          {busy ? "Saving…" : entry ? "Save changes" : "Add entry"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={subtleBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- entry row ---------- */

function EntryRow({
  entry,
  adminKey,
  onChanged,
  onEdit,
}: {
  entry: LedgerEntry;
  adminKey: string;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Delete this ${entry.direction} of ${egp(entry.amountEgp)} on ${entry.date}? This permanently removes the ledger entry.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/finance/${encodeURIComponent(entry.id)}`,
        { method: "DELETE", headers: authHeaders(adminKey) }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      onChanged();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isExpense = entry.direction === "expense";
  return (
    <article className="rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        {entry.receiptUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(entry.receiptUrl)}
            alt="Receipt"
            className="h-12 w-12 shrink-0 rounded-lg border border-[#0E2A47]/10 object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isExpense
                  ? "bg-[#CC4038]/15 text-[#CC4038]"
                  : "bg-[#5B7186]/15 text-[#3B5578]"
              }`}
            >
              {isExpense ? "−" : "+"} {egp(entry.amountEgp)}
            </span>
            <span className="text-sm font-medium text-[#0E2A47]">
              {labelCategory(entry.category)}
            </span>
            <span className="text-xs text-[#5B7186]">
              {entry.date} · {labelMethod(entry.method)}
            </span>
            {entry.paymentStatus && entry.paymentStatus !== "paid" && (
              <span className="inline-block rounded-full bg-[#D6941F]/15 px-2 py-0.5 text-[11px] font-medium text-[#8A5A12]">
                {entry.paymentStatus}{entry.dueDate ? ` · due ${entry.dueDate}` : ""}
              </span>
            )}
            {entry.recurring?.active && (
              <span className="inline-block rounded-full bg-[#357F75]/15 px-2 py-0.5 text-[11px] font-medium text-[#357F75]">
                ↻ {entry.recurring.frequency}
              </span>
            )}
            {(entry.taxRatePct ?? 0) > 0 && (
              <span className="text-[11px] text-[#5B7186]">VAT {entry.taxRatePct}%</span>
            )}
          </div>
          {(entry.vendor || entry.reference) && (
            <p className="mt-0.5 truncate text-xs text-[#5B7186]">
              {entry.vendor}{entry.vendor && entry.reference ? " · " : ""}{entry.reference ? `#${entry.reference}` : ""}
            </p>
          )}
          {entry.note && (
            <p className="mt-0.5 truncate text-sm text-[#5B7186]">{entry.note}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" disabled={busy} onClick={onEdit} className={subtleBtn}>
            Edit
          </button>
          <button type="button" disabled={busy} onClick={() => void remove()} className={dangerBtn}>
            Delete
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-[#CC4038]">{error}</p>}
    </article>
  );
}

/* ---------- section ---------- */

export default function FinanceSection({
  initialPnl,
  adminKey,
  loadError,
}: {
  initialPnl: PnL | null;
  adminKey: string;
  loadError: string | null;
}) {
  const [month, setMonth] = useState<string>(
    () => initialPnl?.period.tag ?? currentCairoMonth()
  );
  const [pnl, setPnl] = useState<PnL | null>(initialPnl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  // Skip the very first fetch when the server already provided this month.
  const firstLoad = useRef(initialPnl !== null);

  async function load(targetMonth: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/finance?month=${encodeURIComponent(targetMonth)}`,
        { headers: authHeaders(adminKey) }
      );
      if (!res.ok) {
        setError(await readError(res));
        setPnl(null);
        return;
      }
      const payload = (await res.json()) as { pnl: PnL };
      setPnl(payload.pnl);
    } catch {
      setError("Network error — please try again.");
      setPnl(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function refresh() {
    setAdding(false);
    setEditingId(null);
    void load(month);
  }

  async function download(kind: "csv" | "pdf") {
    setDownloading(kind);
    setError(null);
    try {
      const path = kind === "csv" ? "export" : "pdf";
      const res = await fetch(
        `/api/admin/finance/${path}?month=${encodeURIComponent(month)}`,
        { headers: authHeaders(adminKey) }
      );
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pnl-${month}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed — network error.");
    } finally {
      setDownloading(null);
    }
  }

  const editing =
    editingId && pnl ? pnl.entries.find((e) => e.id === editingId) ?? null : null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Finance</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]">
            Month
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentCairoMonth())}
            className="rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-1.5 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]"
          />
        </div>
      </div>

      {pnl && (
        <div className="mb-4 space-y-4">
          <SummaryCards pnl={pnl} />
          {pnl.failures.length > 0 && (
            <div className="rounded-xl border border-[#D8E4F2] bg-[#E4EEFA] px-4 py-2 text-sm text-[#5B7186]">
              Heads up: couldn&apos;t load {pnl.failures.join(", ")} — some numbers may be incomplete.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!adding && !editing && (
              <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
                Add entry
              </button>
            )}
            <button
              type="button"
              disabled={downloading !== null}
              onClick={() => void download("csv")}
              className={subtleBtn}
            >
              {downloading === "csv" ? "Preparing…" : "Export CSV"}
            </button>
            <button
              type="button"
              disabled={downloading !== null}
              onClick={() => void download("pdf")}
              className={subtleBtn}
            >
              {downloading === "pdf" ? "Generating…" : "Generate P&L PDF"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-6 py-4 text-sm text-[#CC4038]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {adding && (
          <EntryForm
            entry={null}
            month={month}
            adminKey={adminKey}
            onSaved={refresh}
            onCancel={() => setAdding(false)}
          />
        )}
        {editing && (
          <EntryForm
            key={editing.id}
            entry={editing}
            month={month}
            adminKey={adminKey}
            onSaved={refresh}
            onCancel={() => setEditingId(null)}
          />
        )}

        {loading ? (
          <p className="text-sm text-[#5B7186]">Loading…</p>
        ) : pnl && pnl.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
            No manual entries this month. Shop order income is counted
            automatically in the summary above.
          </div>
        ) : (
          pnl?.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              adminKey={adminKey}
              onChanged={refresh}
              onEdit={() => {
                setAdding(false);
                setEditingId(entry.id);
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}
