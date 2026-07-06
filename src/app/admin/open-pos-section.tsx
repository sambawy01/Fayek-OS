"use client";

import { useState } from "react";
import type { PurchaseOrder, PurchaseOrderDetail } from "@/lib/sales";
import InstallmentBuilder, { type Inst } from "./installment-builder";

const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";
const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function OpenPOsSection({ initialOpen }: { initialOpen: PurchaseOrder[] }) {
  const [items, setItems] = useState<PurchaseOrder[]>(initialOpen);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-[#0E2A47]">Open Purchase Orders</h2>
      <p className="mt-1 text-sm text-[#5B7186]">
        Customer POs from Sales awaiting invoicing (→ receivable) and fulfilment (→ stock).
      </p>
      {error && <div className="mt-3 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#CC4038]">{error}</div>}
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-6 text-center text-sm text-[#5B7186]">
          No open purchase orders.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((po) => (
            <POCard key={po.id} po={po}
              onProcessed={(id) => setItems((p) => p.filter((x) => x.id !== id))}
              onError={setError} />
          ))}
        </div>
      )}
    </section>
  );
}

function POCard({ po, onProcessed, onError }: { po: PurchaseOrder; onProcessed: (id: number) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [inv, setInv] = useState({ advanceEgp: "", dueDate: "" });
  const [installments, setInstallments] = useState<Inst[]>([]);
  const [busy, setBusy] = useState(false);
  const [fulfilled, setFulfilled] = useState(po.fulfilled);
  const [invoiced, setInvoiced] = useState(!!po.receivableId);

  async function load() {
    setOpen(!open);
    if (detail) return;
    const res = await fetch(`/api/admin/purchase-orders/${po.id}`);
    if (res.ok) setDetail(((await res.json()) as { purchaseOrder: PurchaseOrderDetail }).purchaseOrder);
  }
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/purchase-orders/${po.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { onError(await readError(res)); return null; }
      return (await res.json()) as { purchaseOrder: PurchaseOrderDetail };
    } finally { setBusy(false); }
  }
  async function doFulfil() {
    const r = await act({ action: "fulfil" });
    if (r) { setFulfilled(true); if (r.purchaseOrder.status === "closed") onProcessed(po.id); }
  }
  async function doInvoice() {
    const r = await act({
      action: "invoice",
      advanceEgp: Number(inv.advanceEgp || "0"),
      dueDate: inv.dueDate || null,
      installments: installments
        .map((i) => ({ amountEgp: Number(i.amount || "0"), dueDate: i.due || null }))
        .filter((i) => i.amountEgp > 0),
    });
    if (r) { setInvoiced(true); if (r.purchaseOrder.status === "closed") onProcessed(po.id); }
  }

  return (
    <div className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between text-left" onClick={() => void load()}>
        <p className="text-sm font-medium text-[#0E2A47]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
        <span className="rounded-full bg-[#D6941F]/15 px-2.5 py-0.5 text-xs text-[#8A5A12]">open</span>
      </button>
      {open && detail && (
        <div className="mt-3 border-t border-[#0E2A47]/10 pt-3">
          {detail.lines.map((l, i) => (
            <p key={i} className="text-sm text-[#0E2A47]">{l.name} · {l.qty} × {egp(l.unitPriceEgp)}</p>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className={subtleBtn} disabled={busy || fulfilled} onClick={() => void doFulfil()}>{fulfilled ? "Fulfilled ✓" : "Fulfil (deduct stock)"}</button>
          </div>
          {!invoiced ? (
            <div className="mt-3 rounded-xl border border-[#1668C7]/20 bg-[#F4F8FD] px-3 py-2">
              <p className="mb-2 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Invoice → receivable</p>
              <div className="flex flex-wrap items-center gap-2">
                <input className="w-28 rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" inputMode="numeric" placeholder="Advance EGP" value={inv.advanceEgp} onChange={(e) => setInv({ ...inv, advanceEgp: e.target.value })} />
                <input className="rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" type="date" value={inv.dueDate} onChange={(e) => setInv({ ...inv, dueDate: e.target.value })} title="Overall due date" />
                <button className={primaryBtn} disabled={busy} onClick={() => void doInvoice()}>Invoice</button>
              </div>
              <div className="mt-3">
                <InstallmentBuilder
                  value={installments}
                  onChange={setInstallments}
                  remaining={Math.max(0, po.totalEgp - Number(inv.advanceEgp || "0"))}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#0E7490]">Invoiced ✓ (receivable created — see Finance › Receivables)</p>
          )}
        </div>
      )}
    </div>
  );
}
