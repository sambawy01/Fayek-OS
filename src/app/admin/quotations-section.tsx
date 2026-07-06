"use client";

import { useState } from "react";
import type { ProductOpt } from "./product-combobox";
import type { Quotation } from "@/lib/sales";
import {
  inputCls, primaryBtn, subtleBtn, egp, readError,
  LineEditor, CompanySearch, type Line,
} from "./sales-shared";

/**
 * Quotations & Outreach — the sales workspace. Build/send quotations (convert
 * accepted ones into purchase orders) and draft customer outreach.
 */
export default function QuotationsSection({
  products, priceBySlug, initialQuotations,
}: {
  products: ProductOpt[];
  priceBySlug: Record<string, number>;
  initialQuotations: Quotation[];
}) {
  const [view, setView] = useState<"quotes" | "outreach">("quotes");
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-serif text-2xl text-[#0E2A47]">Quotations &amp; Outreach</h2>
        {(["quotes", "outreach"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={view === v ? primaryBtn : subtleBtn}>
            {v === "quotes" ? "Quotations" : "Outreach"}
          </button>
        ))}
      </div>
      {view === "quotes"
        ? <Quotations products={products} priceBySlug={priceBySlug} initial={initialQuotations} />
        : <Outreach />}
    </section>
  );
}

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
    if (poRes.ok) { void patch(q.id, "accepted"); setItems((p) => p.map((x) => x.id === q.id ? { ...x, status: "converted" } : x)); setError("Converted to a purchase order — see the Purchase Orders tab."); }
    else setError(await readError(poRes));
  }

  return (
    <div>
      <div className="mb-3 flex justify-between">
        <p className="text-sm text-[#5B7186]">Build a quotation, download the PDF, and convert to a purchase order when accepted.</p>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New quotation</button>}
      </div>
      {error && <div className="mb-3 rounded-2xl border border-[#1668C7]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#0E7490]">{error}</div>}
      {adding && (
        <div className="mb-5 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CompanySearch value={company.name} onPick={(name, id) => setCompany({ name, id })} />
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Valid until</label>
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
        {items.length === 0 && <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">No quotations yet.</div>}
        {items.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#0E2A47]">Q-{q.id} · {q.companyName} · {egp(q.totalEgp)}</p>
              <p className="text-xs text-[#5B7186]">{q.status}{q.validUntil ? ` · valid to ${q.validUntil}` : ""}</p>
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

interface OutreachResult {
  subject: string; body: string; html: string; ai: boolean;
  relevantProducts?: string[]; researched?: boolean; aiUnavailable?: boolean; webSearchAvailable?: boolean;
}

function Outreach() {
  const KINDS: { id: string; label: string }[] = [
    { id: "intro", label: "Introduction" }, { id: "followup", label: "Follow-up" },
    { id: "quote_cover", label: "Quote cover" }, { id: "reminder", label: "Payment reminder" },
  ];
  const [kind, setKind] = useState("intro");
  const [customer, setCustomer] = useState("");
  const [website, setWebsite] = useState("");
  const [context, setContext] = useState("");
  const [signature, setSignature] = useState("");
  const [out, setOut] = useState<OutreachResult | null>(null);
  const [busy, setBusy] = useState<"" | "template" | "ai">("");
  const [copied, setCopied] = useState<"" | "email" | "text">("");

  async function gen(personalize: boolean) {
    setBusy(personalize ? "ai" : "template");
    try {
      const res = await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, customerName: customer, website, context, signature, personalize }) });
      if (res.ok) setOut((await res.json()) as OutreachResult);
    } finally { setBusy(""); }
  }

  async function copyFormatted() {
    if (!out) return;
    try {
      // Rich HTML + plain-text fallback, so pasting into Gmail/Outlook keeps the
      // logo band and brand styling.
      const item = new ClipboardItem({
        "text/html": new Blob([out.html], { type: "text/html" }),
        "text/plain": new Blob([out.body], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } catch {
      await navigator.clipboard.writeText(out.body); // fallback for older browsers
    }
    setCopied("email"); setTimeout(() => setCopied(""), 1500);
  }

  async function copyText() {
    if (!out) return;
    await navigator.clipboard.writeText(`Subject: ${out.subject}\n\n${out.body}`);
    setCopied("text"); setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-[#5B7186]">Branded outreach emails (real logo &amp; brand colours). “Personalise with AI” researches the customer’s website and drafts a tailored message referencing specific products and improvements.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} className={kind === k.id ? primaryBtn : subtleBtn}>{k.label}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Customer / contact name</label>
          <input className={inputCls} placeholder="e.g. Eng. Hany Sadek" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Customer website <span className="text-[#1668C7]">(for AI research)</span></label>
          <input className={inputCls} placeholder="e.g. company.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Your signature</label>
          <input className={inputCls} placeholder="Your name · title (e.g. Omar — Sales)" value={signature} onChange={(e) => setSignature(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">Brief / goal <span className="text-[#5B7186]/70">(optional)</span></label>
          <input className={inputCls} placeholder="e.g. they run a bottling line; pitch our filtration + lower cost" value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={subtleBtn} disabled={!!busy} onClick={() => void gen(false)}>Use template</button>
        <button className={primaryBtn} disabled={!!busy} onClick={() => void gen(true)}>{busy === "ai" ? "Researching & drafting…" : "Personalise with AI"}</button>
      </div>
      {out && (
        <div className="mt-4 rounded-2xl border border-[#0E2A47]/10 bg-white p-4">
          {out.aiUnavailable && (
            <div className="mb-3 rounded-xl border border-[#D6941F]/40 bg-[#F4F8FD] px-3 py-2 text-xs text-[#8A5A12]">
              AI is not configured yet — showing the standard template. Set <code>OLLAMA_API_KEY</code>{!out.webSearchAvailable && <> and <code>TAVILY_API_KEY</code></>} to enable research-driven personalisation.
            </div>
          )}
          <p className="text-sm font-medium text-[#0E2A47]">Subject: {out.subject}
            {out.ai && <span className="ml-2 rounded-full bg-[#1668C7]/15 px-2 py-0.5 text-xs text-[#0E7490]">AI{out.researched ? " · researched" : ""}</span>}
          </p>
          {out.relevantProducts && out.relevantProducts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {out.relevantProducts.map((p, i) => (
                <span key={i} className="rounded-full bg-[#0E2A47]/8 px-2 py-0.5 text-xs text-[#0E2A47]">{p}</span>
              ))}
            </div>
          )}
          <p className="mt-3 mb-2 text-[11px] uppercase tracking-[0.06em] text-[#5B7186]">Branded email preview</p>
          <div className="overflow-hidden rounded-xl border border-[#0E2A47]/10">
            <iframe title="Branded email preview" srcDoc={out.html} className="h-[460px] w-full bg-white" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primaryBtn} onClick={() => void copyFormatted()}>{copied === "email" ? "Copied!" : "Copy branded email"}</button>
            <button className={subtleBtn} onClick={() => void copyText()}>{copied === "text" ? "Copied!" : "Copy plain text"}</button>
          </div>
          <p className="mt-2 text-xs text-[#5B7186]">“Copy branded email” pastes the logo &amp; colours straight into Gmail or Outlook.</p>
        </div>
      )}
    </div>
  );
}
