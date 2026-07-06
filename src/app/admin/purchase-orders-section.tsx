"use client";

import { useState, useEffect } from "react";
import type { ProductOpt } from "./product-combobox";
import type { PurchaseOrder } from "@/lib/sales";
import {
  inputCls, primaryBtn, subtleBtn, egp, PO_STATUS, readError,
  LineEditor, CompanySearch, type Line,
} from "./sales-shared";

/**
 * Industrial purchase-order generator (replaces the retail POS). Sales builds a
 * customer PO from the abrasives/filtration catalogue; on save it lands in the
 * order book as `open` and surfaces in Finance for invoicing & fulfilment.
 */
export default function PurchaseOrdersSection({
  products, priceBySlug, initial,
}: {
  products: ProductOpt[];
  priceBySlug: Record<string, number>;
  initial: PurchaseOrder[];
}) {
  const [items, setItems] = useState<PurchaseOrder[]>(initial);
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setItems(initial); }, [initial]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState<{ name: string; id: number | null }>({ name: "", id: null });
  const [poRef, setPoRef] = useState("");
  const [needBy, setNeedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);

  function reset() {
    setCompany({ name: "", id: null }); setPoRef(""); setNeedBy(""); setNotes("");
    setLines([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);
  }

  async function create() {
    const payloadLines = lines.filter((l) => l.slug && Number(l.qty) > 0)
      .map((l) => ({ slug: l.slug, qty: Number(l.qty), unitPriceEgp: Number(l.unitPriceEgp || priceBySlug[l.slug] || 0) }));
    if (!company.name || payloadLines.length === 0) return setError("Pick a customer and add at least one line item.");
    setBusy(true); setError(null);
    try {
      const noteParts = [
        poRef.trim() && `Customer PO ref: ${poRef.trim()}`,
        needBy && `Required by: ${needBy}`,
        notes.trim(),
      ].filter(Boolean);
      const res = await fetch("/api/admin/purchase-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, companyName: company.name, notes: noteParts.join(" · "), lines: payloadLines }),
      });
      if (!res.ok) return setError(await readError(res));
      const { purchaseOrder } = (await res.json()) as { purchaseOrder: PurchaseOrder };
      setItems((p) => [purchaseOrder, ...p]);
      setAdding(false); reset();
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Purchase Orders</h2>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New purchase order</button>}
      </div>
      <p className="mb-4 text-sm text-[#5B7186]">
        Generate a customer purchase order from the catalogue. New orders enter the order book as{" "}
        <b>open</b> and reflect in Finance for invoicing &amp; fulfilment.
      </p>

      {error && <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#CC4038]">{error}</div>}

      {adding && (
        <div className="mb-6 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><CompanySearch value={company.name} onPick={(name, id) => setCompany({ name, id })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Customer PO reference</label>
              <input className={inputCls} placeholder="e.g. their internal PO #" value={poRef} onChange={(e) => setPoRef(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Required by</label>
              <input className={inputCls} type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} /></div>
          </div>
          <LineEditor products={products} priceBySlug={priceBySlug} lines={lines} setLines={setLines} />
          <div className="mt-3">
            <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Notes / delivery instructions</label>
            <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="mt-3 flex gap-2">
            <button className={primaryBtn} disabled={busy} onClick={() => void create()}>Generate purchase order</button>
            <button className={subtleBtn} onClick={() => { setAdding(false); reset(); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">No purchase orders yet.</div>}
        {items.map((po) => (
          <div key={po.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0E2A47]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
              {po.notes && <p className="truncate text-xs text-[#5B7186]">{po.notes}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PO_STATUS[po.status] ?? ""}`}>{po.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
