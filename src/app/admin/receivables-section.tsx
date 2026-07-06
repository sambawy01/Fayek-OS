"use client";

import { useState, useEffect } from "react";
import type { Receivable, ReceivableDetail } from "@/lib/receivables";
import type { CompanyDirectory } from "@/lib/companies";
import InstallmentBuilder, { type Inst } from "./installment-builder";
import { ProofField } from "./proof-upload";

const METHODS: [string, string][] = [["bank_transfer", "Bank transfer"], ["cheque", "Cheque"]];
const methodLabel = (m: string) => METHODS.find(([v]) => v === m)?.[1] ?? m;

const inputCls =
  "w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]";
const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";

const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;
const STATUS: Record<string, string> = {
  pending: "bg-[#CC4038]/12 text-[#CC4038]",
  partial: "bg-[#D6941F]/15 text-[#8A5A12]",
  paid: "bg-[#1668C7]/15 text-[#0E7490]",
  void: "bg-[#0E2A47]/10 text-[#5B7186]",
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
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setItems(initialReceivables); }, [initialReceivables]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const [f, setF] = useState({
    companyId: null as number | null, companyName: "",
    totalEgp: "", dueDate: "", advanceAmount: "", advanceMethod: "bank_transfer", advanceProofUrl: "", notes: "",
  });
  const [installments, setInstallments] = useState<Inst[]>([]);
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
          advanceAmount: Number(f.advanceAmount || "0"), advanceMethod: f.advanceMethod, advanceProofUrl: f.advanceProofUrl,
          installments: installments
            .map((i) => ({ amountEgp: Number(i.amount || "0"), dueDate: i.due || null }))
            .filter((i) => i.amountEgp > 0),
        }),
      });
      if (!res.ok) return setError(await readError(res));
      const { receivable } = (await res.json()) as { receivable: ReceivableDetail };
      setItems((prev) => [receivable, ...prev]);
      setAdding(false);
      setF({ companyId: null, companyName: "", totalEgp: "", dueDate: "", advanceAmount: "", advanceMethod: "bank_transfer", advanceProofUrl: "", notes: "" });
      setInstallments([]);
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
        <h2 className="font-serif text-2xl text-[#0E2A47]">Receivables</h2>
        {!adding && <button className={primaryBtn} onClick={() => setAdding(true)}>New credit sale</button>}
      </div>
      <p className="mb-4 text-sm text-[#5B7186]">
        Pending payments — advances and installments. Outstanding:{" "}
        <span className="font-medium text-[#0E2A47]">{egp(totalOutstanding)}</span>
      </p>

      {error && <div className="mb-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">{error}</div>}

      {adding && (
        <div className="mb-6 rounded-2xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-5 py-4">
          <div className="relative mb-3">
            <input className={inputCls} placeholder="Customer (search or type a name)" value={companyQ || f.companyName}
              onChange={(e) => void searchCompanies(e.target.value)} />
            {companyHits.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-[#0E2A47]/15 bg-white">
                {companyHits.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setF({ ...f, companyId: c.id, companyName: c.name }); setCompanyQ(c.name); setCompanyHits([]); }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[#E4EEFA]">
                    {c.name}{c.taxId && <span className="ml-2 text-xs text-[#5B7186]">Tax ID {c.taxId}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Total (EGP)</label>
              <input className={inputCls} inputMode="numeric" value={f.totalEgp} onChange={(e) => setF({ ...f, totalEgp: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Due date</label>
              <input className={inputCls} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Advance paid (EGP)</label>
              <input className={inputCls} inputMode="numeric" value={f.advanceAmount} onChange={(e) => setF({ ...f, advanceAmount: e.target.value })} /></div>
            <div><label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#5B7186]">Advance method</label>
              <select className={inputCls} value={f.advanceMethod} onChange={(e) => setF({ ...f, advanceMethod: e.target.value })}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            {Number(f.advanceAmount || "0") > 0 && (
              <div><ProofField label="Advance proof" value={f.advanceProofUrl} onUploaded={(url) => setF((s) => ({ ...s, advanceProofUrl: url }))} onError={setError} /></div>
            )}
          </div>
          <div className="mt-4">
            <InstallmentBuilder
              value={installments}
              onChange={setInstallments}
              remaining={Math.max(0, Number(f.totalEgp || "0") - Number(f.advanceAmount || "0"))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button className={primaryBtn} disabled={busy || !f.totalEgp} onClick={() => void create()}>Create</button>
            <button className={subtleBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
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
  const [pay, setPay] = useState({ amount: "", method: "bank_transfer", proofUrl: "" });
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
    if (!pay.proofUrl) return onError("Attach a proof of payment before recording.");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/receivables/${receivable.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEgp: Number(pay.amount), method: pay.method, proofUrl: pay.proofUrl }),
      });
      if (!res.ok) return onError(await readError(res));
      const { receivable: nr } = (await res.json()) as { receivable: ReceivableDetail };
      setDetail(nr); onUpdated(nr); setPay({ amount: "", method: "bank_transfer", proofUrl: "" });
    } catch { onError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  const r = detail ?? receivable;
  return (
    <div className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void load()}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#0E2A47]">{r.companyName || "Customer"}</p>
          <p className="text-xs text-[#5B7186]">
            {egp(r.balanceEgp)} due of {egp(r.totalEgp)}
            {r.dueDate && <span className={overdue(r.dueDate) && r.status !== "paid" ? "text-[#CC4038]" : ""}> · due {r.dueDate}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status] ?? ""}`}>{r.status}</span>
      </button>

      {open && detail && (
        <div className="mt-3 border-t border-[#0E2A47]/10 pt-3 text-sm">
          {detail.installments.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Installment plan</p>
              {detail.installments.map((i) => (
                <p key={i.id} className="text-[#0E2A47]">#{i.seq} · {egp(i.amountEgp)}{i.dueDate ? ` · due ${i.dueDate}` : ""}</p>
              ))}
            </div>
          )}
          {detail.payments.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Payments</p>
              {detail.payments.map((p) => (
                <p key={p.id} className="text-[#0E2A47]">
                  {egp(p.amountEgp)} · {methodLabel(p.method)} · {p.kind} · {new Date(p.paidAt).toLocaleDateString()}
                  {p.proofUrl
                    ? <> · <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-[#1668C7] underline">proof</a></>
                    : <span className="text-[#CC4038]"> · no proof</span>}
                </p>
              ))}
            </div>
          )}
          {r.status !== "paid" && r.status !== "void" && (
            <div className="rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Record a payment</p>
              <div className="flex flex-wrap items-end gap-2">
                <input className="w-28 rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" inputMode="numeric"
                  placeholder="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <select className="rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" value={pay.method}
                  onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className={primaryBtn} disabled={busy} onClick={() => void record()}>Record payment</button>
              </div>
              <div className="mt-2 max-w-xs">
                <ProofField value={pay.proofUrl} onUploaded={(url) => setPay((s) => ({ ...s, proofUrl: url }))} onError={onError} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
