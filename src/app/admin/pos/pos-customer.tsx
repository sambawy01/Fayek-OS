"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyDirectory } from "@/lib/companies";

const inputCls =
  "w-full rounded-xl border border-[#3A332C]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";

/**
 * Customer picker for the POS: search the company directory, select one, or
 * quick-add a new customer. Reports the chosen company (or null = walk-in) up
 * to the sale form. Uses the sales-safe /api/admin/companies directory.
 */
export default function PosCustomer({
  selected,
  onSelect,
}: {
  selected: CompanyDirectory | null;
  onSelect: (c: CompanyDirectory | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CompanyDirectory[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ name: "", taxId: "", commercialReg: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounced = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) return; // don't search while one is chosen
    if (debounced.current) clearTimeout(debounced.current);
    if (q.trim().length < 1) { setResults([]); return; }
    debounced.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/companies?search=${encodeURIComponent(q)}`);
        if (res.ok) {
          const { companies } = (await res.json()) as { companies: CompanyDirectory[] };
          setResults(companies);
          setOpen(true);
        }
      } catch { /* ignore */ }
    }, 200);
    return () => { if (debounced.current) clearTimeout(debounced.current); };
  }, [q, selected]);

  async function quickCreate() {
    if (nu.name.trim().length < 2) { setErr("Company name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nu),
      });
      const data = (await res.json().catch(() => ({}))) as { company?: CompanyDirectory; error?: string };
      if (!res.ok || !data.company) { setErr(data.error ?? "Couldn't add the customer."); return; }
      onSelect(data.company);
      setAdding(false);
      setNu({ name: "", taxId: "", commercialReg: "", phone: "" });
    } catch { setErr("Network error — please try again."); }
    finally { setBusy(false); }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#357F75]/30 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#38492E]">{selected.name}</p>
          <p className="truncate text-xs text-[#5E6B4F]">
            {[selected.taxId && `Tax ID ${selected.taxId}`, selected.phone].filter(Boolean).join(" · ") || "customer"}
          </p>
        </div>
        <button type="button" className="text-sm text-[#B5483A] underline" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      {!adding ? (
        <>
          <input
            className={inputCls}
            placeholder="Search customer by name / tax ID / phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
          />
          {open && results.length > 0 && (
            <div className="mt-1 max-h-48 overflow-auto rounded-xl border border-[#38492E]/15 bg-white">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onSelect(c); setOpen(false); setQ(""); }}
                  className="block w-full border-b border-[#38492E]/5 px-3 py-2 text-left text-sm text-[#38492E] last:border-0 hover:bg-[#EFE7D6]"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.taxId && <span className="ml-2 text-xs text-[#5E6B4F]">Tax ID {c.taxId}</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="mt-2 text-sm text-[#357F75] underline" onClick={() => setAdding(true)}>
            + New customer
          </button>
        </>
      ) : (
        <div className="rounded-xl border border-[#38492E]/15 bg-white px-3 py-3">
          <input className={`${inputCls} mb-2`} placeholder="Company name *" value={nu.name}
            onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <input className={`${inputCls} mb-2`} placeholder="Tax ID" value={nu.taxId}
            onChange={(e) => setNu({ ...nu, taxId: e.target.value })} />
          <input className={`${inputCls} mb-2`} placeholder="Commercial reg." value={nu.commercialReg}
            onChange={(e) => setNu({ ...nu, commercialReg: e.target.value })} />
          <input className={`${inputCls} mb-2`} placeholder="Phone" value={nu.phone}
            onChange={(e) => setNu({ ...nu, phone: e.target.value })} />
          {err && <p className="mb-2 text-sm text-[#B5483A]">{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void quickCreate()}
              className="rounded-full bg-[#357F75] px-4 py-1.5 text-sm font-medium text-[#FBF4E6] disabled:opacity-50">
              Add & select
            </button>
            <button type="button" onClick={() => { setAdding(false); setErr(null); }}
              className="rounded-full border border-[#38492E]/15 px-3 py-1.5 text-sm text-[#38492E]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
