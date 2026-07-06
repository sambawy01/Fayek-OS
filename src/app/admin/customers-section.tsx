"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, CompanyDirectory } from "@/lib/companies";

const inputCls =
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

const EMPTY = {
  name: "", taxId: "", commercialReg: "", contactName: "",
  phone: "", email: "", address: "", city: "", notes: "", paymentTerms: "",
};

export default function CustomersSection({
  initialCompanies,
  canAccount,
}: {
  initialCompanies: CompanyDirectory[];
  /** Owner/Admin: see + edit the full account (notes, payment terms, address). */
  canAccount: boolean;
}) {
  const [companies, setCompanies] = useState<CompanyDirectory[]>(initialCompanies);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Company | null>(null);
  const firstLoad = useRef(true);

  // Debounced search.
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    const h = setTimeout(() => void load(search), 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function load(q: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/companies?search=${encodeURIComponent(q)}`);
      if (!res.ok) return setError(await readError(res));
      const { companies } = (await res.json()) as { companies: CompanyDirectory[] };
      setCompanies(companies);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function create() {
    if (form.name.trim().length < 2) return setError("Company name is required.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) return setError(await readError(res));
      const { company } = (await res.json()) as { company: CompanyDirectory };
      setCompanies((prev) => [company, ...prev]);
      setForm({ ...EMPTY });
      setAdding(false);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function openEdit(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/companies/${id}`);
      if (!res.ok) return setError(await readError(res));
      const { company } = (await res.json()) as { company: Company };
      setEditForm(company);
      setEditId(id);
    } catch { setError("Network error — please try again."); }
  }

  async function saveEdit() {
    if (!editForm || editId == null) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/companies/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) return setError(await readError(res));
      const { company } = (await res.json()) as { company: Company };
      setCompanies((prev) => prev.map((c) => (c.id === company.id
        ? { id: company.id, name: company.name, taxId: company.taxId, commercialReg: company.commercialReg, contactName: company.contactName, phone: company.phone, email: company.email, city: company.city, active: company.active }
        : c)));
      setEditId(null); setEditForm(null);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  function field(label: string, key: keyof typeof EMPTY, ph = "") {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]">{label}</label>
        <input className={inputCls} placeholder={ph} value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#0E2A47]">Customers</h2>
        {!adding && (
          <button className={primaryBtn} onClick={() => { setAdding(true); setEditId(null); }}>
            Add customer
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-[#5B7186]">
        Company accounts — search or add a customer with their tax ID and
        commercial registration.
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">{error}</div>
      )}

      {/* create */}
      {adding && (
        <div className="mb-6 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Company name *", "name")}
            {field("Tax ID (الرقم الضريبي)", "taxId")}
            {field("Commercial reg. (السجل التجاري)", "commercialReg")}
            {field("Contact name", "contactName")}
            {field("Phone", "phone")}
            {field("Email", "email")}
            {field("City", "city")}
            {field("Address", "address")}
            {canAccount && field("Payment terms", "paymentTerms", "e.g. Net 30")}
            {canAccount && field("Notes (private)", "notes")}
          </div>
          <div className="mt-3 flex gap-2">
            <button className={primaryBtn} disabled={busy || form.name.trim().length < 2} onClick={() => void create()}>Save customer</button>
            <button className={subtleBtn} onClick={() => { setAdding(false); setForm({ ...EMPTY }); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* search */}
      <input className={`${inputCls} mb-4`} placeholder="Search by name, tax ID, contact or phone…"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {/* list */}
      <div className="space-y-2">
        {companies.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
            No customers{search ? " match your search." : " yet — add the first one."}
          </div>
        )}
        {companies.map((c) => (
          <div key={c.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0E2A47]">{c.name}</p>
                <p className="text-xs text-[#5B7186]">
                  {[c.contactName, c.phone, c.city].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs text-[#5B7186]">
                  {c.taxId && <>Tax ID {c.taxId}</>}
                  {c.taxId && c.commercialReg && " · "}
                  {c.commercialReg && <>CR {c.commercialReg}</>}
                </p>
              </div>
              {canAccount && (
                <button className={subtleBtn} onClick={() => void openEdit(c.id)}>Open</button>
              )}
            </div>
            {canAccount && editId === c.id && editForm && (
              <div className="mt-2 rounded-2xl border border-[#1668C7]/30 bg-[#F4F8FD] px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(["name","taxId","commercialReg","contactName","phone","email","city","address","paymentTerms","notes"] as const).map((k) => (
                    <div key={k}>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[#5B7186]">{k}</label>
                      <input className={inputCls} value={(editForm[k] as string) ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button className={primaryBtn} disabled={busy} onClick={() => void saveEdit()}>Save</button>
                  <button className={subtleBtn} onClick={() => { setEditId(null); setEditForm(null); }}>Close</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
