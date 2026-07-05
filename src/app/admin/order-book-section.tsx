"use client";

import { useState } from "react";
import type { PurchaseOrder, PurchaseOrderDetail } from "@/lib/sales";
import { egp, subtleBtn, PO_STATUS } from "./sales-shared";

type Filter = "all" | "open" | "invoiced" | "fulfilled" | "closed";

/**
 * Order book — every purchase order and its lifecycle (open → invoiced /
 * fulfilled → closed). Read-only monitoring surface for Finance/Admin/Owner;
 * POs are created in the Purchase Orders tab and processed in Finance.
 */
export default function OrderBookSection({ initial }: { initial: PurchaseOrder[] }) {
  const [items] = useState<PurchaseOrder[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = items.reduce<Record<string, number>>((m, po) => { m[po.status] = (m[po.status] ?? 0) + 1; return m; }, {});
  const shown = filter === "all" ? items : items.filter((po) => po.status === filter);
  const openValue = items.filter((po) => po.status === "open" || po.status === "invoiced").reduce((s, po) => s + po.totalEgp, 0);

  const FILTERS: Filter[] = ["all", "open", "invoiced", "fulfilled", "closed"];

  return (
    <section>
      <h2 className="font-serif text-2xl text-[#38492E]">Order Book</h2>
      <p className="mt-1 text-sm text-[#5E6B4F]">
        All purchase orders across their lifecycle. In-flight value (open + invoiced):{" "}
        <span className="font-medium text-[#38492E]">{egp(openValue)}</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize transition ${filter === f ? "bg-[#357F75] text-[#FBF4E6]" : "border border-[#38492E]/15 bg-[#FBF4E6] text-[#38492E] hover:bg-[#EFE7D6]"}`}>
            {f}{f !== "all" && counts[f] ? ` (${counts[f]})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">
            No purchase orders{filter === "all" ? " yet" : ` that are ${filter}`}.
          </div>
        ) : shown.map((po) => <OrderRow key={po.id} po={po} />)}
      </div>
    </section>
  );
}

function OrderRow({ po }: { po: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);

  async function load() {
    setOpen(!open);
    if (detail) return;
    const res = await fetch(`/api/admin/purchase-orders/${po.id}`);
    if (res.ok) setDetail(((await res.json()) as { purchaseOrder: PurchaseOrderDetail }).purchaseOrder);
  }

  return (
    <div className="rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void load()}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#38492E]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
          <p className="text-xs text-[#5E6B4F]">
            {new Date(po.createdAt).toLocaleDateString()}
            {po.fulfilled && " · stock deducted"}
            {po.receivableId && ` · receivable #${po.receivableId}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PO_STATUS[po.status] ?? ""}`}>{po.status}</span>
      </button>
      {open && detail && (
        <div className="mt-3 border-t border-[#38492E]/10 pt-3">
          {detail.lines.map((l, i) => (
            <p key={i} className="text-sm text-[#38492E]">{l.name} · {l.qty} × {egp(l.unitPriceEgp)}</p>
          ))}
          {detail.notes && <p className="mt-2 text-xs text-[#5E6B4F]">{detail.notes}</p>}
          {po.status === "open" && <p className="mt-2 text-xs text-[#8A6418]">Awaiting invoicing &amp; fulfilment in Finance.</p>}
        </div>
      )}
    </div>
  );
}
