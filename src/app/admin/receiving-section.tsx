"use client";

import { useState } from "react";
import type { Batch, BatchDetail } from "@/lib/batches";

export interface ProductOption { slug: string; name: string }

const inputCls =
  "w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
const primaryBtn =
  "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";

const STATUS_STYLE: Record<string, string> = {
  dispatched: "bg-[#C08A2D]/15 text-[#8A6418]",
  received: "bg-[#357F75]/15 text-[#2A6A61]",
  pending_approval: "bg-[#B5483A]/15 text-[#B5483A]",
  resolved: "bg-[#357F75]/15 text-[#2A6A61]",
  rejected: "bg-[#38492E]/10 text-[#5E6B4F]",
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
}: {
  initialBatches: Batch[];
  products: ProductOption[];
  canCreate: boolean;
}) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  // --- create dispatch form ---
  const [head, setHead] = useState({ reference: "", supplier: "", notes: "" });
  const [lines, setLines] = useState<{ slug: string; expectedQty: string }[]>([
    { slug: products[0]?.slug ?? "", expectedQty: "" },
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
      setLines([{ slug: products[0]?.slug ?? "", expectedQty: "" }]);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#38492E]">Receiving</h2>
        {canCreate && !adding && (
          <button className={primaryBtn} onClick={() => setAdding(true)}>New dispatch</button>
        )}
      </div>
      <p className="mb-4 text-sm text-[#5E6B4F]">
        Factory batches dispatched to the warehouse. Inventory receives and
        counts each; any discrepancy is escalated to the Owner/Admin for a decision.
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-[#B5483A]/30 bg-[#FBF4E6] px-5 py-3 text-sm text-[#B5483A]">{error}</div>
      )}

      {adding && (
        <div className="mb-6 rounded-2xl border border-[#38492E]/10 bg-[#FBF4E6] px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className={inputCls} placeholder="Supplier / factory" value={head.supplier}
              onChange={(e) => setHead({ ...head, supplier: e.target.value })} />
            <input className={inputCls} placeholder="Reference / PO" value={head.reference}
              onChange={(e) => setHead({ ...head, reference: e.target.value })} />
            <input className={inputCls} placeholder="Notes" value={head.notes}
              onChange={(e) => setHead({ ...head, notes: e.target.value })} />
          </div>
          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">Products dispatched</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className={`${inputCls} flex-1`} value={l.slug}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, slug: e.target.value } : x))}>
                  {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
                <input className={`${inputCls} w-28`} inputMode="numeric" placeholder="Qty" value={l.expectedQty}
                  onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, expectedQty: e.target.value } : x))} />
                <button className={subtleBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))}>–</button>
              </div>
            ))}
          </div>
          <button className={`${subtleBtn} mt-2`}
            onClick={() => setLines([...lines, { slug: products[0]?.slug ?? "", expectedQty: "" }])}>
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
          <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">
            No batches yet.
          </div>
        )}
        {batches.map((b) => (
          <BatchRow key={b.id} batch={b} open={openId === b.id}
            onToggle={() => setOpenId(openId === b.id ? null : b.id)}
            onUpdated={(nb) => setBatches((prev) => prev.map((x) => x.id === nb.id ? nb : x))} />
        ))}
      </div>
    </section>
  );
}

function BatchRow({
  batch, open, onToggle, onUpdated,
}: {
  batch: Batch; open: boolean; onToggle: () => void; onUpdated: (b: Batch) => void;
}) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [recv, setRecv] = useState<Record<number, string>>({});
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
    <div className="rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void loadDetail()}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#38492E]">
            Batch #{batch.id}
            {batch.supplier && <span className="text-[#5E6B4F]"> · {batch.supplier}</span>}
            {batch.reference && <span className="text-[#5E6B4F]"> · {batch.reference}</span>}
          </p>
          <p className="text-xs text-[#5E6B4F]">{new Date(batch.dispatchedAt).toLocaleDateString()}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[batch.status] ?? ""}`}>
          {statusLabel(batch.status)}
        </span>
      </button>

      {open && detail && (
        <div className="mt-3 border-t border-[#38492E]/10 pt-3">
          {error && <p className="mb-2 text-sm text-[#B5483A]">{error}</p>}
          {outcome && <p className="mb-2 text-sm text-[#2A6A61]">{outcome}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-[#5E6B4F]">
                <th className="pb-1">Product</th><th className="pb-1 text-center">Expected</th><th className="pb-1 text-center">Received</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id} className="border-t border-[#38492E]/5">
                  <td className="py-1.5 text-[#38492E]">{l.name}</td>
                  <td className="py-1.5 text-center text-[#5E6B4F]">{l.expectedQty}</td>
                  <td className="py-1.5 text-center">
                    {batch.status === "dispatched" ? (
                      <input className="w-20 rounded-lg border border-[#38492E]/15 bg-white px-2 py-1 text-center text-sm"
                        inputMode="numeric" value={recv[l.id] ?? ""}
                        onChange={(e) => setRecv({ ...recv, [l.id]: e.target.value })} />
                    ) : (
                      <span className={l.receivedQty !== null && l.receivedQty !== l.expectedQty ? "font-medium text-[#B5483A]" : "text-[#38492E]"}>
                        {l.receivedQty ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {batch.status === "dispatched" && (
            <div className="mt-3">
              <button className={primaryBtn} disabled={busy} onClick={() => void receive()}>
                {busy ? "Receiving…" : "Receive & count"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
