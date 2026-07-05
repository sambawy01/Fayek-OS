"use client";

import { useState } from "react";
import ProductCombobox, { type ProductOpt } from "./product-combobox";
import type { CompanyDirectory } from "@/lib/companies";

export const inputCls =
  "w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
export const primaryBtn =
  "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
export const subtleBtn =
  "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";
export const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

export const PO_STATUS: Record<string, string> = {
  open: "bg-[#C08A2D]/15 text-[#8A6418]",
  fulfilled: "bg-[#357F75]/15 text-[#2A6A61]",
  invoiced: "bg-[#357F75]/15 text-[#2A6A61]",
  closed: "bg-[#38492E]/10 text-[#5E6B4F]",
  cancelled: "bg-[#B5483A]/12 text-[#B5483A]",
};

export async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export interface Line { slug: string; name: string; qty: string; unitPriceEgp: string }

/** Line-item editor shared by the quotation + purchase-order builders. */
export function LineEditor({
  products, priceBySlug, lines, setLines,
}: {
  products: ProductOpt[]; priceBySlug: Record<string, number>;
  lines: Line[]; setLines: (l: Line[]) => void;
}) {
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPriceEgp) || 0), 0);
  const lbl = "mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5E6B4F]";
  return (
    <div>
      <div className="space-y-3">
        {lines.map((l, i) => {
          const subtotal = (Number(l.qty) || 0) * (Number(l.unitPriceEgp) || 0);
          return (
            <div key={i} className="rounded-2xl border border-[#38492E]/12 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">Item {i + 1}</span>
                {lines.length > 1 && (
                  <button className="rounded-full px-2 py-0.5 text-sm text-[#B5483A] transition hover:bg-[#B5483A]/10"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove item">Remove</button>
                )}
              </div>
              <div>
                <label className={lbl}>Product</label>
                <ProductCombobox products={products} value={l.slug}
                  onChange={(slug) => setLines(lines.map((x, j) => j === i
                    ? { ...x, slug, name: products.find((p) => p.slug === slug)?.name ?? "", unitPriceEgp: x.unitPriceEgp || String(priceBySlug[slug] ?? "") }
                    : x))} />
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <label className={lbl}>Qty</label>
                  <input className={inputCls} inputMode="numeric" placeholder="1" value={l.qty}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                </div>
                <div className="w-36">
                  <label className={lbl}>Unit price (EGP)</label>
                  <input className={inputCls} inputMode="numeric" placeholder="0" value={l.unitPriceEgp}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPriceEgp: e.target.value } : x))} />
                </div>
                <div className="ml-auto pb-2 text-right">
                  <span className={lbl}>Subtotal</span>
                  <span className="text-sm font-medium text-[#38492E]">{egp(subtotal)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className={subtleBtn} onClick={() => setLines([...lines, { slug: "", name: "", qty: "1", unitPriceEgp: "" }])}>+ Add line</button>
        <span className="text-sm text-[#38492E]">Total: <span className="font-medium">{egp(total)}</span></span>
      </div>
    </div>
  );
}

/** Customer typeahead — searches the company directory, allows a free-typed name. */
export function CompanySearch({ onPick, value }: { onPick: (name: string, id: number | null) => void; value: string }) {
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
