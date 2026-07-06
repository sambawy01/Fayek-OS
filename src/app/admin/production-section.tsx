"use client";

import { useState, useEffect } from "react";
import type { ProductionOrder, ProductionStatus } from "@/lib/production";

const primaryBtn = "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn = "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";
const inputCls = "rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm";

const STATUS_STYLE: Record<string, string> = {
  pending_approval: "bg-[#D6941F]/15 text-[#8A5A12]",
  approved: "bg-[#1668C7]/15 text-[#0E7490]",
  in_production: "bg-[#357F75]/15 text-[#357F75]",
  done: "bg-[#0E2A47]/10 text-[#5B7186]",
  rejected: "bg-[#CC4038]/12 text-[#CC4038]",
  cancelled: "bg-[#0E2A47]/8 text-[#5B7186]",
};
const STATUS_LABEL: Record<string, string> = {
  pending_approval: "pending", approved: "approved", in_production: "in production",
  done: "done", rejected: "rejected", cancelled: "cancelled",
};

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function ProductionSection({
  initialOrders, products, canManage,
}: {
  initialOrders: ProductionOrder[];
  products: { slug: string; name: string }[];
  canManage: boolean;
}) {
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders);
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);
  const [filter, setFilter] = useState<"open" | "pending_approval" | "done" | "all">("open");
  const [slug, setSlug] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const counts = orders.reduce<Record<string, number>>((m, o) => { m[o.status] = (m[o.status] ?? 0) + 1; return m; }, {});
  const shown = orders.filter((o) =>
    filter === "all" ? true
      : filter === "open" ? (o.status === "approved" || o.status === "in_production")
      : o.status === filter
  );

  async function create() {
    if (!slug || !(Number(qty) > 0)) { setError("Pick a product and a quantity."); return; }
    setBusy(true); setError(null); setMsg(null);
    try {
      const name = products.find((p) => p.slug === slug)?.name ?? "";
      const res = await fetch("/api/admin/production-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, qty: Number(qty), note }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      const { order } = (await res.json()) as { order: ProductionOrder };
      setOrders((p) => [order, ...p]);
      setSlug(""); setQty(""); setNote("");
      setMsg(`Production order #${order.id} created (pending approval).`);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function act(id: number, action: string) {
    setError(null); setMsg(null);
    try {
      const res = await fetch(`/api/admin/production-orders/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      const { order } = (await res.json()) as { order: ProductionOrder };
      setOrders((p) => p.map((o) => o.id === order.id ? order : o));
    } catch { setError("Network error — please try again."); }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Production</h2>
      </div>
      <p className="mb-3 text-sm text-[#5B7186]">
        Factory production orders — auto-raised when stock hits an item&rsquo;s reorder point, or created manually.
        {canManage ? " Approve to send to the factory queue." : " Approved orders are the factory queue."}
      </p>

      {msg && <div className="mb-3 rounded-2xl border border-[#1668C7]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#0E7490]">{msg}</div>}
      {error && <div className="mb-3 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#CC4038]">{error}</div>}

      {canManage && (
        <div className="mb-4 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-3">
          <p className="mb-2 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Create a production order</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputCls + " min-w-[16rem]"} value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
            <input className={inputCls + " w-28"} inputMode="numeric" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className={inputCls + " min-w-[12rem] flex-1"} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={primaryBtn} disabled={busy} onClick={() => void create()}>{busy ? "Creating…" : "Create & send"}</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["open", "pending_approval", "done", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${filter === f ? "bg-[#1668C7] text-[#F4F8FD]" : "border border-[#0E2A47]/15 bg-[#F4F8FD] text-[#0E2A47] hover:bg-[#E4EEFA]"}`}>
            {f === "open" ? "Queue" : f === "pending_approval" ? `Pending${counts.pending_approval ? ` (${counts.pending_approval})` : ""}` : f === "done" ? "Done" : "All"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">No production orders here.</div>
        ) : shown.map((o) => (
          <div key={o.id} className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0E2A47]">PRD-{o.id} · {o.name || o.slug} · {o.qty} units</p>
                <p className="text-xs text-[#5B7186]">{o.reason === "auto_reorder" ? "Auto-reorder" : o.reason === "invoice_shortfall" ? "Invoice shortfall" : "Manual"}{o.note ? ` · ${o.note}` : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status] ?? ""}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canManage && o.status === "pending_approval" && (
                <>
                  <button className={primaryBtn} onClick={() => void act(o.id, "approve")}>Approve</button>
                  <button className={subtleBtn} onClick={() => void act(o.id, "reject")}>Reject</button>
                </>
              )}
              {o.status === "approved" && <button className={primaryBtn} onClick={() => void act(o.id, "start")}>Start production</button>}
              {o.status === "in_production" && <button className={primaryBtn} onClick={() => void act(o.id, "done")}>Mark produced</button>}
              {canManage && (o.status === "approved" || o.status === "in_production") && (
                <button className={subtleBtn} onClick={() => void act(o.id, "cancel")}>Cancel</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
