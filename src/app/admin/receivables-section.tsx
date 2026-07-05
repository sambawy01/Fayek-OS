"use client";

import { useState } from "react";
import type { Receivable, ReceivableDetail } from "@/lib/receivables";
import type { CompanyDirectory } from "@/lib/companies";

const inputCls =
  "w-full rounded-xl border border-[#38492E]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
const primaryBtn =
  "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";

const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;
const STATUS: Record<string, string> = {
  pending: "bg-[#B5483A]/12 text-[#B5483A]",
  partial: "bg-[#C08A2D]/15 text-[#8A6418]",
  paid: "bg-[#357F75]/15 text-[#2A6A61]",
  void: "bg-[#38492E]/10 text-[#5E6B4F]",
};
function overdue(due: string | null): boolean {
  return !!due && new Date(due) < new Date(new Date().toDateString());
}
async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function ReceivablesSection({
  initialReceivables,
}: {
  initialReceivables: Receivable[];
}) {
  const [items, setItems] = useState<Receivable[]>(initialReceivables);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const [f, setF] = useState({
    companyId: null as number | null, companyName: "",
    totalEgp: "", dueDate: "", advanceAmount: "", advanceMethod: "cash",
    installmentCount: "", firstDueDate: "", notes: "",
  });
  const [companyQ, setCompanyQ] = useState("");
  const [companyHits, setCompanyHits] = useState<CompanyDirectory[]>([]);

  async function searchCompanies(q: string) {
    setCompanyQ(q);
    setF({ ...f, companyName: q, companyId: null });
    if (q.trim().length < 1) return setCompanyHits([]);
    try {
      const res = await fetch(`/api/admin/companies?search=${encodeURIComponent(q)}`);
      if (res.ok) setCompanyHits(((await res.json()) as { companies: CompanyDirectory[] }).companies);
    } catch { /* ignore */ }
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/receivables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: f.companyId, companyName: f.companyName,
          totalEgp: Number(f.totalEgp), dueDate: f.dueDate || null, notes: f.notes,
          advanceAmount: Number(f.advanceAmount || "0"), advanceMethod: f.advanceMethod,
          installmentCount: Number(f.installmentCount || "0"), firstDueDate: f.firstDueDate || null,
        }),
      });
      if (!res.ok) return setError(await readError(res));
      const { receivable } = (await res.json()) as { receivable: ReceivableDetail };
      setItems((prev) => [receivable, ...prev]);
      setAdding(false);
      setF({ companyId: null, companyName: "", totalEgp: "", dueDate: "", advanceAmount: "", advanceMethod: "cash", installmentCount: "", firstDueDate: "", notes: "" });
      setCompanyQ(""); setCompanyHits([]);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  const totalOutstanding = items
    .filter((r) => r.status === "pending" || r.status === "partial")
    .reduce((s, r) => s + r.balanceEgp, 0);

  return (
    <section className="mt-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#38492E]">Receivables</h2>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New credit sale</button>}
      </div>
      <p className="mb-4 text-sm text-[#5E6B4F]">
        Pending payments — advances and installments. Outstanding:{" "}
        <span className="font-medium text-[#38492E]">{egp(totalOutstanding)}</span>
      </p>

      {error && <div className="mb-4 rounded-2xl border border-[#B5483A]/30 bg-[#FBF4E6] px-5 py-3 text-sm text-[#B5483A]">{error}</div>}

      {adding && (
        <div className="mb-6 rounded-2xl border border-[#38492E]/10 bg-[#FBF4E6] px-5 py-4">
          <div className="relative mb-3">
            <input className={inputCls} placeholder="Customer (search or type a name)" value={companyQ || f.companyName}
              onChange={(e) => void searchCompanies(e.target.value)} />
            {companyHits.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-[#38492E]/15 bg-white">
                {companyHits.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setF({ ...f, companyId: c.id, companyName: c.name }); setCompanyQ(c.name); setCompanyHits([]); }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[#EFE7D6]">
                    {c.name}{c.taxId && <span className="ml-2 text-xs text-[#5E6B4F]">Tax ID {c.taxId}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">Total (EGP)</label>
              <input className={inputCls} inputMode="numeric" value={f.totalEgp} onChange={(e) => setF({ ...f, totalEgp: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">Due date</label>
              <input className={inputCls} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">Advance paid (EGP)</label>
              <input className={inputCls} inputMode="numeric" value={f.advanceAmount} onChange={(e) => setF({ ...f, advanceAmount: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">Advance method</label>
              <select className={inputCls} value={f.advanceMethod} onChange={(e) => setF({ ...f, advanceMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="instapay">InstaPay</option><option value="transfer">Transfer</option>
              </select></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]"># Installments</label>
              <input className={inputCls} inputMode="numeric" placeholder="0 = none" value={f.installmentCount} onChange={(e) => setF({ ...f, installmentCount: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5E6B4F]">First installment due</label>
              <input className={inputCls} type="date" value={f.firstDueDate} onChange={(e) => setF({ ...f, firstDueDate: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={primaryBtn} disabled={busy || !f.totalEgp} onClick={() => void create()}>Create</button>
            <button className={subtleBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">
            No receivables yet.
          </div>
        )}
        {items.map((r) => (
          <ReceivableRow key={r.id} receivable={r}
            onUpdated={(nr) => setItems((prev) => prev.map((x) => x.id === nr.id ? nr : x))}
            onError={setError} />
        ))}
      </div>
    </section>
  );
}

function ReceivableRow({
  receivable, onUpdated, onError,
}: {
  receivable: Receivable; onUpdated: (r: Receivable) => void; onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "cash" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setOpen(!open);
    if (detail) return;
    try {
      const res = await fetch(`/api/admin/receivables/${receivable.id}`);
      if (res.ok) setDetail(((await res.json()) as { receivable: ReceivableDetail }).receivable);
    } catch { /* ignore */ }
  }

  async function record() {
    if (!(Number(pay.amount) > 0)) return onError("Enter a positive amount.");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/receivables/${receivable.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEgp: Number(pay.amount), method: pay.method }),
      });
      if (!res.ok) return onError(await readError(res));
      const { receivable: nr } = (await res.json()) as { receivable: ReceivableDetail };
      setDetail(nr); onUpdated(nr); setPay({ amount: "", method: "cash" });
    } catch { onError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  const r = detail ?? receivable;
  return (
    <div className="rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void load()}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#38492E]">{r.companyName || "Customer"}</p>
          <p className="text-xs text-[#5E6B4F]">
            {egp(r.balanceEgp)} due of {egp(r.totalEgp)}
            {r.dueDate && <span className={overdue(r.dueDate) && r.status !== "paid" ? "text-[#B5483A]" : ""}> · due {r.dueDate}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status] ?? ""}`}>{r.status}</span>
      </button>

      {open && detail && (
        <div className="mt-3 border-t border-[#38492E]/10 pt-3 text-sm">
          {detail.installments.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5E6B4F]">Installment plan</p>
              {detail.installments.map((i) => (
                <p key={i.id} className="text-[#38492E]">#{i.seq} · {egp(i.amountEgp)}{i.dueDate ? ` · due ${i.dueDate}` : ""}</p>
              ))}
            </div>
          )}
          {detail.payments.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5E6B4F]">Payments</p>
              {detail.payments.map((p) => (
                <p key={p.id} className="text-[#38492E]">{egp(p.amountEgp)} · {p.method} · {p.kind} · {new Date(p.paidAt).toLocaleDateString()}</p>
              ))}
            </div>
          )}
          {r.status !== "paid" && r.status !== "void" && (
            <div className="flex flex-wrap items-center gap-2">
              <input className="w-28 rounded-xl border border-[#38492E]/15 bg-white px-2 py-1.5 text-sm" inputMode="numeric"
                placeholder="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <select className="rounded-xl border border-[#38492E]/15 bg-white px-2 py-1.5 text-sm" value={pay.method}
                onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="instapay">InstaPay</option><option value="transfer">Transfer</option>
              </select>
              <button className={primaryBtn} disabled={busy} onClick={() => void record()}>Record payment</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
