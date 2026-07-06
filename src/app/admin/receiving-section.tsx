"use client";

import { useState } from "react";
import type { Batch, BatchDetail } from "@/lib/batches";
import ProductCombobox from "./product-combobox";

export interface ProductOption { slug: string; name: string }

const inputCls =
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";

const STATUS_STYLE: Record<string, string> = {
  dispatched: "bg-[#D6941F]/15 text-[#8A5A12]",
  received: "bg-[#1668C7]/15 text-[#0E7490]",
  pending_approval: "bg-[#CC4038]/15 text-[#CC4038]",
  resolved: "bg-[#1668C7]/15 text-[#0E7490]",
  rejected: "bg-[#0E2A47]/10 text-[#5B7186]",
};
const statusLabel = (s: string) =>
  ({ dispatched: "Dispatched", received: "Received", pending_approval: "Pending approval", resolved: "Resolved", rejected: "Rejected" } as Record<string, string>)[s] ?? s;

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function ReceivingSection({
  initialBatches,
  products,
  canCreate,
  canReceive,
  mode = "receive",
}: {
  initialBatches: Batch[];
  products: ProductOption[];
  /** Owner/Admin/Factory: declare a dispatch. */
  canCreate: boolean;
  /** Owner/Admin/Inventory: receive & count. Factory cannot. */
  canReceive: boolean;
  /** Which side this tab is: the Factory Dispatch tab or the Inventory Receiving tab. */
  mode?: "dispatch" | "receive";
}) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  // --- create dispatch form ---
  const [head, setHead] = useState({ reference: "", supplier: "", notes: "" });
  const [lines, setLines] = useState<{ slug: string; expectedQty: string }[]>([
    { slug: "", expectedQty: "" },
  ]);

  async function createBatch() {
    const parsed = lines
      .filter((l) => l.slug && l.expectedQty.trim())
      .map((l) => ({ slug: l.slug, expectedQty: Number(l.expectedQty) }));
    if (parsed.length === 0) return setError("Add at least one product line with a quantity.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...head, lines: parsed }),
      });
      if (!res.ok) return setError(await readError(res));
      const { batch } = (await res.json()) as { batch: BatchDetail };
      setBatches((prev) => [batch, ...prev]);
      setAdding(false);
      setHead({ reference: "", supplier: "", notes: "" });
      setLines([{ slug: "", expectedQty: "" }]);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  const isDispatch = mode === "dispatch";
  const awaiting = batches.filter((b) => b.status === "dispatched").length;
  const ordered = [...batches].sort((a, b) => {
    const rank = (s: string) => (s === "dispatched" ? 0 : s === "pending_approval" ? 1 : 2);
    return rank(a.status) - rank(b.status) || b.id - a.id;
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">{isDispatch ? "Factory Dispatch" : "Inventory Receiving"}</h2>
        {canCreate && !adding && (
          <button className={primaryBtn} onClick={() => setAdding(true)}>New dispatch</button>
        )}
      </div>
      <p className="mb-4 text-sm text-[#5B7186]">
        {isDispatch
          ? "Declare a batch dispatched to the warehouse — the system generates a Dispatch Order for your records. Inventory then confirms the received count; the status updates here."
          : "Factory batches dispatched to the warehouse. Confirm the received count on each; adjusting a quantity that differs from expected escalates to Owner/Admin for approval before stock is added."}
      </p>

      {canReceive && awaiting > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#1668C7]/25 bg-[#E4EEFA] px-5 py-3 text-sm text-[#0E2A47]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1668C7] text-xs font-bold text-white">{awaiting}</span>
          <span><b>{awaiting}</b> factory {awaiting === 1 ? "dispatch" : "dispatches"} awaiting your confirmation — receive &amp; count below.</span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">{error}</div>
      )}

      {adding && (
        <div className="mb-6 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className={inputCls} placeholder="Supplier / factory" value={head.supplier}
              onChange={(e) => setHead({ ...head, supplier: e.target.value })} />
            <input className={inputCls} placeholder="Reference / PO" value={head.reference}
              onChange={(e) => setHead({ ...head, reference: e.target.value })} />
            <input className={inputCls} placeholder="Notes" value={head.notes}
              onChange={(e) => setHead({ ...head, notes: e.target.value })} />
          </div>
          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]">Products dispatched</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <ProductCombobox products={products} value={l.slug}
                    onChange={(slug) => setLines(lines.map((x, j) => j === i ? { ...x, slug } : x))} />
                </div>
                <input className={`${inputCls} w-28`} inputMode="numeric" placeholder="Qty" value={l.expectedQty}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, expectedQty: e.target.value } : x))} />
                <button className={subtleBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))}>–</button>
              </div>
            ))}
          </div>
          <button className={`${subtleBtn} mt-2`}
            onClick={() => setLines([...lines, { slug: "", expectedQty: "" }])}>
            + Add line
          </button>
          <div className="mt-4 flex gap-2">
            <button className={primaryBtn} disabled={busy} onClick={() => void createBatch()}>Create dispatch</button>
            <button className={subtleBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {batches.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
            No batches yet.
          </div>
        )}
        {ordered.map((b) => (
          <BatchRow key={b.id} batch={b} open={openId === b.id} canReceive={canReceive}
            onToggle={() => setOpenId(openId === b.id ? null : b.id)}
            onUpdated={(nb) => setBatches((prev) => prev.map((x) => x.id === nb.id ? nb : x))} />
        ))}
      </div>
    </section>
  );
}

function BatchRow({
  batch, open, canReceive, onToggle, onUpdated,
}: {
  batch: Batch; open: boolean; canReceive: boolean; onToggle: () => void; onUpdated: (b: Batch) => void;
}) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [recv, setRecv] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function loadDetail() {
    onToggle();
    if (detail) return;
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`);
      if (res.ok) {
        const { batch: b } = (await res.json()) as { batch: BatchDetail };
        setDetail(b);
        setRecv(Object.fromEntries(b.lines.map((l) => [l.id, String(l.expectedQty)])));
      }
    } catch { /* ignore */ }
  }

  async function receive() {
    if (!detail) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: detail.lines.map((l) => ({ lineId: l.id, receivedQty: Number(recv[l.id] ?? "0") })),
          notes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { batch?: BatchDetail; outcome?: string; error?: string };
      if (!res.ok || !data.batch) return setError(data.error ?? "Couldn't receive the batch.");
      setDetail(data.batch);
      onUpdated(data.batch);
      setOutcome(data.outcome === "received"
        ? "Received — stock updated."
        : "Discrepancy found — escalated to Owner/Admin for approval.");
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left" onClick={() => void loadDetail()}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#0E2A47]">
              Batch #{batch.id}
              {batch.supplier && <span className="text-[#5B7186]"> · {batch.supplier}</span>}
              {batch.reference && <span className="text-[#5B7186]"> · {batch.reference}</span>}
            </p>
            <p className="text-xs text-[#5B7186]">{new Date(batch.dispatchedAt).toLocaleDateString()}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[batch.status] ?? ""}`}>
            {statusLabel(batch.status)}
          </span>
        </button>
        <a
          href={`/api/admin/batches/${batch.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-lg border border-[#0E2A47]/15 bg-[#F4F8FD] px-2.5 py-1.5 text-xs font-medium text-[#1668C7] transition hover:bg-[#E4EEFA]"
          title="Dispatch order (PDF)"
        >
          Dispatch order
        </a>
      </div>

      {open && detail && (
        <div className="mt-3 border-t border-[#0E2A47]/10 pt-3">
          {error && <p className="mb-2 text-sm text-[#CC4038]">{error}</p>}
          {outcome && <p className="mb-2 text-sm text-[#0E7490]">{outcome}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-[#5B7186]">
                <th className="pb-1">Product</th><th className="pb-1 text-center">Expected</th><th className="pb-1 text-center">Received</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id} className="border-t border-[#0E2A47]/5">
                  <td className="py-1.5 text-[#0E2A47]">{l.name}</td>
                  <td className="py-1.5 text-center text-[#5B7186]">{l.expectedQty}</td>
                  <td className="py-1.5 text-center">
                    {batch.status === "dispatched" && canReceive ? (
                      <input className="w-20 rounded-lg border border-[#0E2A47]/15 bg-white px-2 py-1 text-center text-sm"
                        inputMode="numeric" value={recv[l.id] ?? ""}
                        onChange={(e) => setRecv({ ...recv, [l.id]: e.target.value })} />
                    ) : (
                      <span className={l.receivedQty !== null && l.receivedQty !== l.expectedQty ? "font-medium text-[#CC4038]" : "text-[#0E2A47]"}>
                        {l.receivedQty ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {batch.status === "dispatched" && canReceive && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-[#5B7186]">
                Enter the actual received quantity per line. Any figure that differs from expected
                <span className="font-medium text-[#8A5A12]"> escalates to Owner/Admin</span> for approval before stock is added.
              </p>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Receipt comments (damage, shortages, condition…)</label>
              <textarea
                className={`${inputCls} mb-2`}
                rows={2}
                placeholder="e.g. 3 cartons water-damaged; 2 units cracked — noted for the record"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button className={primaryBtn} disabled={busy} onClick={() => void receive()}>
                {busy ? "Receiving…" : "Receive & confirm"}
              </button>
            </div>
          )}
          {detail.receiptNotes && (
            <div className="mt-3 rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Receipt comments</p>
              <p className="mt-0.5 text-sm text-[#0E2A47]">{detail.receiptNotes}</p>
            </div>
          )}
          {batch.status === "dispatched" && !canReceive && (
            <p className="mt-3 text-xs text-[#5B7186]">Awaiting warehouse receipt.</p>
          )}
        </div>
      )}
    </div>
  );
}
