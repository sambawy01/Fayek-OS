"use client";

import { useState, useEffect } from "react";
import type { ProductionOrder, ProductionStatus } from "@/lib/production";
import type { ProductionSuggestion } from "@/lib/ai-production";

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

/** "due in 3d 4h" / "due in 5h" / "overdue 2d" — with a colour class. */
function countdown(deadlineIso: string | null): { text: string; cls: string } | null {
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const span = d > 0 ? `${d}d ${h}h` : `${h}h`;
  if (overdue) return { text: `overdue ${span}`, cls: "bg-[#CC4038]/12 text-[#CC4038]" };
  if (ms < 2 * 86_400_000) return { text: `due in ${span}`, cls: "bg-[#D6941F]/15 text-[#8A5A12]" };
  return { text: `due in ${span}`, cls: "bg-[#357F75]/12 text-[#357F75]" };
}

export default function ProductionSection({
  initialOrders, products, canManage, mode = "manage",
}: {
  initialOrders: ProductionOrder[];
  products: { slug: string; name: string }[];
  canManage: boolean;
  /** "manage" = Owner/Admin authoring + approval; "queue" = factory queue only. */
  mode?: "manage" | "queue";
}) {
  // Authoring & approval live ONLY in manage mode (Owner/Admin). The factory
  // sees a queue: start production + dispatch, no create/approve.
  const manage = mode === "manage" && canManage;
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders);
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);
  const [filter, setFilter] = useState<"open" | "pending_approval" | "done" | "all">(mode === "queue" ? "open" : "pending_approval");
  const [slug, setSlug] = useState("");
  const [qty, setQty] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dispatchQty, setDispatchQty] = useState<Record<number, string>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<(ProductionSuggestion & { qtyStr: string })[] | null>(null);

  async function aiSuggest() {
    setAiBusy(true); setError(null); setMsg(null); setSuggestions(null);
    try {
      const res = await fetch("/api/admin/production-orders/ai-suggest", { method: "POST" });
      const data = (await res.json()) as { suggestions?: ProductionSuggestion[]; reason?: string };
      if (!res.ok) { setError(data.reason ?? "AI suggestion failed."); return; }
      const list = data.suggestions ?? [];
      setSuggestions(list.map((s) => ({ ...s, qtyStr: String(s.suggestedQty) })));
      if (list.length === 0) setMsg(data.reason ?? "No production suggestions right now.");
    } catch { setError("Network error — please try again."); }
    finally { setAiBusy(false); }
  }

  async function createFromSuggestion(s: ProductionSuggestion & { qtyStr: string }) {
    const n = Number(s.qtyStr);
    if (!(n > 0)) { setError("Enter a quantity."); return; }
    setError(null); setMsg(null);
    try {
      const res = await fetch("/api/admin/production-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: s.slug, name: s.name, qty: n, note: `AI: ${s.rationale}`.slice(0, 200) }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      const { order } = (await res.json()) as { order: ProductionOrder };
      setOrders((p) => [order, ...p]);
      setSuggestions((prev) => (prev ? prev.filter((x) => x.slug !== s.slug) : prev));
      setMsg(`Production order #${order.id} created from AI suggestion (pending approval).`);
    } catch { setError("Network error — please try again."); }
  }

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
        body: JSON.stringify({ slug, name, qty: Number(qty), note, deadline: deadline || null }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      const { order } = (await res.json()) as { order: ProductionOrder };
      setOrders((p) => [order, ...p]);
      setSlug(""); setQty(""); setNote(""); setDeadline("");
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

  async function doDispatch(o: ProductionOrder) {
    const q = Number(dispatchQty[o.id] ?? String(o.qty));
    if (!(q > 0)) { setError("Enter the dispatched quantity."); return; }
    setError(null); setMsg(null);
    try {
      const res = await fetch(`/api/admin/production-orders/${o.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch", qty: q }),
      });
      if (!res.ok) { setError(await readError(res)); return; }
      const data = (await res.json()) as { order: ProductionOrder; escalated?: boolean };
      setOrders((p) => p.map((x) => x.id === data.order.id ? data.order : x));
      setMsg(data.escalated
        ? `Dispatched ${q} to the warehouse — differs from the ordered ${o.qty}; escalated to Owner/Admin.`
        : `Dispatched ${q} to the warehouse.`);
    } catch { setError("Network error — please try again."); }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Production</h2>
        {manage && (
          <button className={primaryBtn} disabled={aiBusy} onClick={() => void aiSuggest()}>
            {aiBusy ? "Analysing…" : "✨ AI suggest orders"}
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-[#5B7186]">
        {mode === "queue"
          ? "Approved production orders — the factory queue. Start production, then dispatch to the warehouse. Only Owner/Admin create and approve orders."
          : "Create production orders (with AI suggestions) and approve auto-raised ones — Owner/Admin only. Approved orders go to the factory queue."}
      </p>

      {msg && <div className="mb-3 rounded-2xl border border-[#1668C7]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#0E7490]">{msg}</div>}
      {error && <div className="mb-3 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#CC4038]">{error}</div>}

      {manage && suggestions && suggestions.length > 0 && (
        <div className="mb-4 rounded-2xl border border-[#1668C7]/25 bg-[#F4F8FD] px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.06em] text-[#5B7186]">✨ AI-suggested production (from sales · inventory · cash)</p>
            <button className="text-xs text-[#5B7186] underline" onClick={() => setSuggestions(null)}>dismiss</button>
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.slug} className="rounded-xl border border-[#0E2A47]/10 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#0E2A47]">{s.name}</span>
                  <span className="text-xs text-[#5B7186]">produce</span>
                  <input className={inputCls + " w-24"} inputMode="numeric" value={s.qtyStr}
                    onChange={(e) => setSuggestions((prev) => prev ? prev.map((x) => x.slug === s.slug ? { ...x, qtyStr: e.target.value } : x) : prev)} />
                  <button className={primaryBtn} onClick={() => void createFromSuggestion(s)}>Create order</button>
                </div>
                {s.rationale && <p className="mt-1 text-xs italic text-[#5B7186]">{s.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {manage && (
        <div className="mb-4 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-3">
          <p className="mb-2 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Create a production order</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className={inputCls + " min-w-[16rem]"} value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
            <input className={inputCls + " w-28"} inputMode="numeric" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className={inputCls} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} title="Deadline (defaults to 14 days)" />
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
              <div className="flex shrink-0 items-center gap-2">
                {(() => { const c = (o.status === "pending_approval" || o.status === "approved" || o.status === "in_production") ? countdown(o.deadline) : null;
                  return c ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.cls}`}>{c.text}</span> : null; })()}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status] ?? ""}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {manage && o.status === "pending_approval" && (
                <>
                  <button className={primaryBtn} onClick={() => void act(o.id, "approve")}>Approve</button>
                  <button className={subtleBtn} onClick={() => void act(o.id, "reject")}>Reject</button>
                </>
              )}
              {o.status === "approved" && <button className={primaryBtn} onClick={() => void act(o.id, "start")}>Start production</button>}
              {o.status === "in_production" && (
                <>
                  <span className="text-xs text-[#5B7186]">Dispatch</span>
                  <input className={inputCls + " w-24"} inputMode="numeric" placeholder={String(o.qty)}
                    value={dispatchQty[o.id] ?? String(o.qty)}
                    onChange={(e) => setDispatchQty((m) => ({ ...m, [o.id]: e.target.value }))} />
                  <button className={primaryBtn} onClick={() => void doDispatch(o)}>Dispatch to warehouse</button>
                </>
              )}
              {manage && (o.status === "approved" || o.status === "in_production") && (
                <button className={subtleBtn} onClick={() => void act(o.id, "cancel")}>Cancel</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
