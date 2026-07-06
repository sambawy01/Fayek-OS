"use client";

import { useState, useEffect } from "react";
import type { PurchaseOrderDetail } from "@/lib/sales";

const primaryBtn = "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50";
const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

/**
 * Warehouse queue of purchase orders Finance has sent for dispatch to the client.
 * The warehouse confirms the dispatch, which deducts stock (fulfilment).
 */
export default function ClientDispatchSection({
  initial, canConfirm,
}: {
  initial: PurchaseOrderDetail[];
  canConfirm: boolean;
}) {
  const [items, setItems] = useState<PurchaseOrderDetail[]>(initial);
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setItems(initial); }, [initial]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number[]>([]);

  async function confirm(id: number) {
    setBusyId(id); setError(null);
    try {
      const res = await fetch(`/api/admin/purchase-orders/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fulfil" }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      setDone((d) => [...d, id]);
      setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== id)), 900);
    } catch { setError("Network error — please try again."); }
    finally { setBusyId(null); }
  }

  return (
    <section>
      <h2 className="font-serif text-2xl text-[#0E2A47]">Client Dispatch</h2>
      <p className="mt-1 mb-4 text-sm text-[#5B7186]">
        Purchase orders Finance has released to the warehouse (see the <b>Product Release Form</b>).
        Print the client dispatch order, then confirm the dispatch to {" "}
        <b>deduct the stock</b> and close the order.
      </p>

      {error && <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">{error}</div>}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
          Nothing to dispatch. POs appear here once Finance sends them for dispatch.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((po) => (
            <div key={po.id} className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#0E2A47]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
                <span className="rounded-full bg-[#D6941F]/15 px-2.5 py-0.5 text-xs text-[#8A5A12]">to dispatch</span>
              </div>
              <div className="mt-2 border-t border-[#0E2A47]/10 pt-2">
                {po.lines.map((l, i) => (
                  <p key={i} className="text-sm text-[#0E2A47]">{l.name} · {l.qty} × {egp(l.unitPriceEgp)}</p>
                ))}
              </div>
              {(po.releasedByName || po.dispatchReleaseNote) && (
                <p className="mt-2 text-xs text-[#5B7186]">
                  Released by Finance{po.releasedByName ? ` · ${po.releasedByName}` : ""}
                  {po.dispatchReleaseNote ? ` — “${po.dispatchReleaseNote}”` : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`/api/admin/purchase-orders/${po.id}/release-pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm font-medium text-[#0E2A47] transition hover:bg-[#E4EEFA]"
                  title={`Product Release Form for PO-${po.id}`}
                >
                  Product Release Form (PRF-{po.id})
                </a>
                <a
                  href={`/api/admin/purchase-orders/${po.id}/dispatch-pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm font-medium text-[#1668C7] transition hover:bg-[#E4EEFA]"
                  title={`Client dispatch order for PO-${po.id}`}
                >
                  Dispatch order (PO-{po.id})
                </a>
                {canConfirm && (
                  done.includes(po.id) ? (
                    <span className="text-sm font-medium text-[#0E7490]">Dispatched — stock deducted ✓</span>
                  ) : (
                    <button className={primaryBtn} disabled={busyId === po.id} onClick={() => void confirm(po.id)}>
                      {busyId === po.id ? "Dispatching…" : "Confirm dispatch & deduct stock"}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
