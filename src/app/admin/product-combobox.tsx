"use client";

import { useState } from "react";

export interface ProductOpt {
  slug: string;
  name: string;
}

/**
 * Searchable product picker (type-ahead). Scales to hundreds of SKUs — filters
 * by name or code and caps the visible list. Reusable across any product
 * selection card (Receiving, Quotations, Orders, …).
 */
export default function ProductCombobox({
  products,
  value,
  onChange,
  placeholder = "Search product by name or code…",
}: {
  products: ProductOpt[];
  value: string;
  onChange: (slug: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.slug === value);
  const term = q.trim().toLowerCase();
  const shown = products
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
    .slice(0, 30);

  return (
    <div className="relative">
      <input
        className="w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]"
        value={open ? q : selected?.name ?? ""}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(""); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[#38492E]/15 bg-white shadow-lg">
          {shown.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[#5E6B4F]">No matches</div>
          ) : (
            shown.map((p) => (
              <button
                key={p.slug}
                type="button"
                // onMouseDown fires before the input's blur, so the click lands.
                onMouseDown={(e) => { e.preventDefault(); onChange(p.slug); setOpen(false); }}
                className={`block w-full border-b border-[#38492E]/8 px-3 py-2.5 text-left last:border-0 hover:bg-[#EFE7D6] ${
                  p.slug === value ? "bg-[#EFE7D6]" : ""
                }`}
              >
                <span className="block text-sm font-medium leading-snug text-[#38492E]">{p.name}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-[#5E6B4F]">{p.slug}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
