"use client";

import { useState } from "react";
import ProductCombobox, { type ProductOpt } from "./product-combobox";
import type { CompanyDirectory } from "@/lib/companies";
import type { Quotation, PurchaseOrder } from "@/lib/sales";

const inputCls =
  "w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
const primaryBtn =
  "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";
const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

interface Line { slug: string; name: string; qty: string; unitPriceEgp: string }

export default function SalesSection({
  products,
  priceBySlug,
  initialQuotations,
  initialPOs,
}: {
  products: ProductOpt[];
  priceBySlug: Record<string, number>;
  initialQuotations: Quotation[];
  initialPOs: PurchaseOrder[];
}) {
  const [view, setView] = useState<"quotes" | "pos" | "outreach">("quotes");
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-serif text-2xl text-[#38492E]">Sales</h2>
        {(["quotes", "pos", "outreach"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={view === v ? primaryBtn : subtleBtn}>
            {v === "quotes" ? "Quotations" : v === "pos" ? "Purchase Orders" : "Outreach"}
          </button>
        ))}
      </div>
      {view === "quotes" && <Quotations products={products} priceBySlug={priceBySlug} initial={initialQuotations} />}
      {view === "pos" && <POs products={products} priceBySlug={priceBySlug} initial={initialPOs} />}
      {view === "outreach" && <Outreach />}
    </section>
  );
}

/* ---------- shared line editor ---------- */
function LineEditor({
  products, priceBySlug, lines, setLines,
}: {
  products: ProductOpt[]; priceBySlug: Record<string, number>;
  lines: Line[]; setLines: (l: Line[]) => void;
}) {
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPriceEgp) || 0), 0);
  return (
    <div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <ProductCombobox products={products} value={l.slug}
                onChange={(slug) => setLines(lines.map((x, j) => j === i
                  ? { ...x, slug, name: products.find((p) => p.slug === slug)?.name ?? "", unitPriceEgp: x.unitPriceEgp || String(priceBySlug[slug] ?? "") }
                  : x))} />
            </div>
            <input className={`${inputCls} w-20`} inputMode="numeric" placeholder="Qty" value={l.qty}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <input className={`${inputCls} w-28`} inputMode="numeric" placeholder="Unit EGP" value={l.unitPriceEgp}
              onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPriceEgp: e.target.value } : x))} />
            <button className={subtleBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))}>–</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button className={subtleBtn} onClick={() => setLines([...lines, { slug: "", name: "", qty: "1", unitPriceEgp: "" }])}>+ Add line</button>
        <span className="text-sm text-[#38492E]">Total: <span className="font-medium">{egp(total)}</span></span>
      </div>
    </div>
  );
}

function CompanySearch({ onPick, value }: { onPick: (name: string, id: number | null) => void; value: string }) {
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<CompanyDirectory[]>([]);
  async function search(v: string) {
    setQ(v); onPick(v, null);
    if (v.trim().length < 1) return setHits([]);
    try {
      const res = await fetch(`/api/admin/companies?search=${encodeURIComponent(v)}`);
      if (res.ok) setHits(((await res.json()) as { companies: CompanyDirectory[] }).companies);
    } catch { /* ignore */ }
  }
  return (
    <div className="relative">
      <input className={inputCls} placeholder="Customer (search or type)" value={q} onChange={(e) => void search(e.target.value)} />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-[#38492E]/15 bg-white">
          {hits.map((c) => (
            <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(c.name, c.id); setQ(c.name); setHits([]); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[#EFE7D6]">{c.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- quotations ---------- */
function Quotations({ products, priceBySlug, initial }: { products: ProductOpt[]; priceBySlug: Record<string, number>; initial: Quotation[] }) {
  const [items, setItems] = useState<Quotation[]>(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState<{ name: string; id: number | null }>({ name: "", id: null });
  const [validUntil, setValidUntil] = useState("");
  const [lines, setLines] = useState<Line[]>([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);

  async function create() {
    const payloadLines = lines.filter((l) => l.slug && Number(l.qty) > 0)
      .map((l) => ({ slug: l.slug, qty: Number(l.qty), unitPriceEgp: Number(l.unitPriceEgp || priceBySlug[l.slug] || 0) }));
    if (!company.name || payloadLines.length === 0) return setError("Pick a customer and add at least one line.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/quotations", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, companyName: company.name, validUntil: validUntil || null, lines: payloadLines }) });
      if (!res.ok) return setError(await readError(res));
      const { quotation } = (await res.json()) as { quotation: Quotation };
      setItems((p) => [quotation, ...p]); setAdding(false);
      setCompany({ name: "", id: null }); setValidUntil(""); setLines([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function patch(id: number, status: string) {
    const res = await fetch(`/api/admin/quotations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { const { quotation } = (await res.json()) as { quotation: Quotation }; setItems((p) => p.map((x) => x.id === id ? quotation : x)); }
  }

  async function convert(q: Quotation) {
    const res = await fetch(`/api/admin/quotations/${q.id}`);
    if (!res.ok) return;
    const { quotation } = (await res.json()) as { quotation: Quotation & { lines: { slug: string; qty: number; unitPriceEgp: number }[] } };
    const poRes = await fetch("/api/admin/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: q.companyId, companyName: q.companyName, quotationId: q.id, lines: quotation.lines }) });
    if (poRes.ok) { void patch(q.id, "accepted"); setItems((p) => p.map((x) => x.id === q.id ? { ...x, status: "converted" } : x)); setError("Converted to a purchase order (see Purchase Orders)."); }
    else setError(await readError(poRes));
  }

  return (
    <div>
      <div className="mb-3 flex justify-between">
        <p className="text-sm text-[#5E6B4F]">Build a quotation, download the PDF, and convert to a purchase order when accepted.</p>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New quotation</button>}
      </div>
      {error && <div className="mb-3 rounded-2xl border border-[#357F75]/30 bg-[#FBF4E6] px-4 py-2 text-sm text-[#2A6A61]">{error}</div>}
      {adding && (
        <div className="mb-5 rounded-2xl border border-[#38492E]/10 bg-[#FBF4E6] px-5 py-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CompanySearch value={company.name} onPick={(name, id) => setCompany({ name, id })} />
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">Valid until</label>
              <input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>
          <LineEditor products={products} priceBySlug={priceBySlug} lines={lines} setLines={setLines} />
          <div className="mt-3 flex gap-2">
            <button className={primaryBtn} disabled={busy} onClick={() => void create()}>Create quotation</button>
            <button className={subtleBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">No quotations yet.</div>}
        {items.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#38492E]">Q-{q.id} · {q.companyName} · {egp(q.totalEgp)}</p>
              <p className="text-xs text-[#5E6B4F]">{q.status}{q.validUntil ? ` · valid to ${q.validUntil}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={subtleBtn} href={`/api/admin/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {q.status === "draft" && <button className={subtleBtn} onClick={() => void patch(q.id, "sent")}>Mark sent</button>}
              {(q.status === "draft" || q.status === "sent") && <button className={primaryBtn} onClick={() => void convert(q)}>Convert to PO</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- purchase orders (sales view) ---------- */
function POs({ products, priceBySlug, initial }: { products: ProductOpt[]; priceBySlug: Record<string, number>; initial: PurchaseOrder[] }) {
  const [items, setItems] = useState<PurchaseOrder[]>(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<{ name: string; id: number | null }>({ name: "", id: null });
  const [lines, setLines] = useState<Line[]>([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);

  async function create() {
    const payloadLines = lines.filter((l) => l.slug && Number(l.qty) > 0)
      .map((l) => ({ slug: l.slug, qty: Number(l.qty), unitPriceEgp: Number(l.unitPriceEgp || priceBySlug[l.slug] || 0) }));
    if (!company.name || payloadLines.length === 0) return setError("Pick a customer and add lines.");
    const res = await fetch("/api/admin/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id, companyName: company.name, lines: payloadLines }) });
    if (!res.ok) return setError(await readError(res));
    const { purchaseOrder } = (await res.json()) as { purchaseOrder: PurchaseOrder };
    setItems((p) => [purchaseOrder, ...p]); setAdding(false);
    setCompany({ name: "", id: null }); setLines([{ slug: "", name: "", qty: "1", unitPriceEgp: "" }]);
  }

  return (
    <div>
      <div className="mb-3 flex justify-between">
        <p className="text-sm text-[#5E6B4F]">Customer purchase orders. New POs go to Finance as <b>open</b> for invoicing &amp; fulfilment.</p>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New PO</button>}
      </div>
      {error && <div className="mb-3 rounded-2xl border border-[#B5483A]/30 bg-[#FBF4E6] px-4 py-2 text-sm text-[#B5483A]">{error}</div>}
      {adding && (
        <div className="mb-5 rounded-2xl border border-[#38492E]/10 bg-[#FBF4E6] px-5 py-4">
          <div className="mb-3"><CompanySearch value={company.name} onPick={(name, id) => setCompany({ name, id })} /></div>
          <LineEditor products={products} priceBySlug={priceBySlug} lines={lines} setLines={setLines} />
          <div className="mt-3 flex gap-2">
            <button className={primaryBtn} onClick={() => void create()}>Create purchase order</button>
            <button className={subtleBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">No purchase orders yet.</div>}
        {items.map((po) => (
          <div key={po.id} className="flex items-center justify-between rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
            <p className="text-sm font-medium text-[#38492E]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
            <span className="rounded-full bg-[#38492E]/10 px-2.5 py-0.5 text-xs text-[#38492E]">{po.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- outreach ---------- */
function Outreach() {
  const KINDS: { id: string; label: string }[] = [
    { id: "intro", label: "Introduction" }, { id: "followup", label: "Follow-up" },
    { id: "quote_cover", label: "Quote cover" }, { id: "reminder", label: "Payment reminder" },
  ];
  const [kind, setKind] = useState("intro");
  const [customer, setCustomer] = useState("");
  const [context, setContext] = useState("");
  const [out, setOut] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function gen(personalize: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, customerName: customer, context, personalize }) });
      if (res.ok) setOut((await res.json()) as { subject: string; body: string });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-[#5E6B4F]">Outreach templates to help the sales team. Fill the customer and (optionally) personalise with AI.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} className={kind === k.id ? primaryBtn : subtleBtn}>{k.label}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Customer / contact name" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        <input className={inputCls} placeholder="Context for AI (optional)" value={context} onChange={(e) => setContext(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button className={subtleBtn} disabled={busy} onClick={() => void gen(false)}>Use template</button>
        <button className={primaryBtn} disabled={busy} onClick={() => void gen(true)}>{busy ? "Working…" : "Personalise with AI"}</button>
      </div>
      {out && (
        <div className="mt-4 rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
          <p className="text-sm font-medium text-[#38492E]">Subject: {out.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[#38492E]">{out.body}</pre>
          <button className={`${subtleBtn} mt-3`} onClick={async () => { await navigator.clipboard.writeText(`Subject: ${out.subject}\n\n${out.body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
