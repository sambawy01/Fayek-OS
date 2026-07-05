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
