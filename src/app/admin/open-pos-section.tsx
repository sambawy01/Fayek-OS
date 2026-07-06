"use client";

import { useState, useEffect } from "react";
import type { PurchaseOrder, PurchaseOrderDetail } from "@/lib/sales";
import InstallmentBuilder, { type Inst } from "./installment-builder";
import { ProofField } from "./proof-upload";

const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";
const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function OpenPOsSection({ initialOpen }: { initialOpen: PurchaseOrder[] }) {
  const [items, setItems] = useState<PurchaseOrder[]>(initialOpen);
  // Reflect server auto-refreshes (own actions, cron, other users) into the list.
  useEffect(() => { setItems(initialOpen); }, [initialOpen]);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-[#0E2A47]">Open Purchase Orders</h2>
      <p className="mt-1 text-sm text-[#5B7186]">
        Customer POs from Sales awaiting invoicing (→ receivable) and fulfilment (→ stock).
      </p>
      {error && <div className="mt-3 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-4 py-2 text-sm text-[#CC4038]">{error}</div>}
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-6 text-center text-sm text-[#5B7186]">
          No open purchase orders.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((po) => (
            <POCard key={po.id} po={po}
              onProcessed={(id) => setItems((p) => p.filter((x) => x.id !== id))}
              onError={setError} />
          ))}
        </div>
      )}
    </section>
  );
}

const sectionCls = "mt-3 rounded-xl border border-[#0E2A47]/10 bg-[#F4F8FD] px-3 py-2";
const labelCls = "mb-2 text-xs uppercase tracking-[0.06em] text-[#5B7186]";

function POCard({ po, onProcessed, onError }: { po: PurchaseOrder; onProcessed: (id: number) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // Invoice form (pre-invoice).
  const [dueDate, setDueDate] = useState("");
  const [installments, setInstallments] = useState<Inst[]>([]);
  const [copied, setCopied] = useState(false);
  // Payment received.
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payProofUrl, setPayProofUrl] = useState("");
  const [payUploading, setPayUploading] = useState(false);
  // Release.
  const [relNote, setRelNote] = useState("");
  const [relWaive, setRelWaive] = useState(false);

  const invoiced = !!detail?.receivableId;
  const sent = !!detail?.invoiceSentAt;
  const total = detail?.totalEgp ?? po.totalEgp;
  const paid = detail?.receivablePaidEgp ?? 0;
  const released = detail?.dispatchRequested ?? po.dispatchRequested;

  async function load() {
    setOpen(!open);
    if (detail) return;
    const res = await fetch(`/api/admin/purchase-orders/${po.id}`);
    if (res.ok) setDetail(((await res.json()) as { purchaseOrder: PurchaseOrderDetail }).purchaseOrder);
  }
  async function refresh() {
    const res = await fetch(`/api/admin/purchase-orders/${po.id}`);
    if (res.ok) setDetail(((await res.json()) as { purchaseOrder: PurchaseOrderDetail }).purchaseOrder);
  }
  async function act(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/purchase-orders/${po.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { onError(await readError(res)); return false; }
      const { purchaseOrder } = (await res.json()) as { purchaseOrder: PurchaseOrderDetail };
      setDetail(purchaseOrder);
      if (purchaseOrder.status === "closed") onProcessed(po.id);
      return true;
    } finally { setBusy(false); }
  }
  async function doInvoice() {
    await act({
      action: "invoice",
      dueDate: dueDate || null,
      installments: installments.map((i) => ({ amountEgp: Number(i.amount || "0"), dueDate: i.due || null })).filter((i) => i.amountEgp > 0),
    });
  }
  function copyForClient() {
    if (!detail) return;
    const invNo = `INV-${String(po.id).padStart(4, "0")}`;
    const lines = detail.lines.map((l) => `• ${l.name} — ${l.qty} × ${egp(l.unitPriceEgp)} = ${egp(l.qty * l.unitPriceEgp)}`).join("\n");
    const dueTxt = detail.dueDate ? `Due date: ${detail.dueDate}` : "Payment due on receipt";
    const text =
      `Invoice ${invNo} — Fayek Abrasives\nBill to: ${po.companyName}\n\n${lines}\n\nTotal due: ${egp(total)}\n${dueTxt}\n\nPlease send proof of payment (bank transfer receipt or cheque) once settled. Thank you.`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => onError("Couldn't copy — select and copy manually."));
  }
  async function doPayment() {
    if (!detail?.receivableId) return;
    if (payUploading) return onError("Hold on — the proof of payment is still uploading.");
    if (!(Number(payAmount) > 0)) return onError("Enter a payment amount.");
    if (!payProofUrl) return onError("Attach the customer's proof of payment.");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/receivables/${detail.receivableId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEgp: Number(payAmount), method: payMethod, proofUrl: payProofUrl }),
      });
      if (!res.ok) { onError(await readError(res)); return; }
      setPayAmount(""); setPayProofUrl("");
      await refresh();
    } catch { onError("Network error — please try again."); }
    finally { setBusy(false); }
  }
  async function doRelease() {
    if (!relWaive && !(paid > 0)) return onError("Record the customer's payment first — or tick the trusted-account exception.");
    if (relWaive && !relNote.trim()) return onError("Add an authorization note for the trusted-account exception.");
    await act({ action: "release", note: relNote, waive: relWaive });
  }

  return (
    <div className="rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
      <button className="flex w-full items-center justify-between text-left" onClick={() => void load()}>
        <p className="text-sm font-medium text-[#0E2A47]">PO-{po.id} · {po.companyName} · {egp(po.totalEgp)}</p>
        <span className="rounded-full bg-[#D6941F]/15 px-2.5 py-0.5 text-xs text-[#8A5A12]">open</span>
      </button>
      {open && detail && (
        <div className="mt-3 border-t border-[#0E2A47]/10 pt-3">
          {detail.lines.map((l, i) => (
            <p key={i} className="text-sm text-[#0E2A47]">{l.name} · {l.qty} × {egp(l.unitPriceEgp)}</p>
          ))}

          {/* ── 1. Invoice ─────────────────────────────────────────────── */}
          {!invoiced ? (
            <div className={sectionCls + " border-[#1668C7]/20"}>
              <p className={labelCls}>1 · Invoice → receivable</p>
              <p className="mb-2 text-xs text-[#5B7186]">Raises the receivable ({egp(total)}). No payment is taken here.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input className="rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Overall due date" />
                <button className={primaryBtn} disabled={busy} onClick={() => void doInvoice()}>{busy ? "Invoicing…" : "Invoice"}</button>
              </div>
              <div className="mt-3"><InstallmentBuilder value={installments} onChange={setInstallments} remaining={total} /></div>
            </div>
          ) : (
            <div className={sectionCls + " border-[#1668C7]/20"}>
              <p className={labelCls}>1 · Invoice — send to client</p>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/api/admin/purchase-orders/${po.id}/invoice-pdf`} target="_blank" rel="noreferrer" className={subtleBtn}>Preview invoice (INV-{po.id})</a>
                <button className={subtleBtn} onClick={copyForClient}>{copied ? "Copied!" : "Copy for client"}</button>
                {sent ? (
                  <span className="text-sm font-medium text-[#0E7490]">Sent to client ✓</span>
                ) : (
                  <button className={primaryBtn} disabled={busy} onClick={() => void act({ action: "mark-sent" })}>Mark sent to client</button>
                )}
              </div>
            </div>
          )}

          {/* ── 2. Payment received ────────────────────────────────────── */}
          {invoiced && (
            <div className={sectionCls}>
              <p className={labelCls}>2 · Payment received</p>
              {paid > 0 ? (
                <p className="text-sm font-medium text-[#0E7490]">Payment received ✓ — {egp(paid)} of {egp(total)}{detail.receivableStatus ? ` (${detail.receivableStatus})` : ""}</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-[#5B7186]">Record the customer&rsquo;s payment with its proof (bank receipt or cheque). This unlocks release.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="w-32 rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" inputMode="numeric" placeholder={`Amount (${total})`} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                    <select className="rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="cash">Cash</option>
                    </select>
                    <button className={primaryBtn} disabled={busy || payUploading} onClick={() => void doPayment()}>{payUploading ? "Uploading proof…" : busy ? "Recording…" : "Record payment"}</button>
                  </div>
                  <div className="mt-2 max-w-xs">
                    <ProofField label="Proof of payment" value={payProofUrl} onUploaded={setPayProofUrl} onUploadingChange={setPayUploading} onError={onError} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── 3. Product release ─────────────────────────────────────── */}
          {invoiced && (
            <div className={sectionCls}>
              <p className={labelCls}>3 · Product release → Warehouse</p>
              {released ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#0E7490]">Released to Warehouse ✓</span>
                  <a href={`/api/admin/purchase-orders/${po.id}/release-pdf`} target="_blank" rel="noreferrer" className={subtleBtn}>Product Release Form (PRF-{po.id})</a>
                  <span className="text-xs text-[#5B7186]">Warehouse confirms dispatch &amp; deducts stock.</span>
                </div>
              ) : (
                <>
                  {paid > 0 ? (
                    <p className="mb-2 text-xs text-[#5B7186]">Payment received — ready to release the goods to the warehouse.</p>
                  ) : (
                    <p className="mb-2 text-xs text-[#8A5A12]">Record the payment above to release — or waive it for a trusted key account (Owner/Admin).</p>
                  )}
                  <label className="mb-2 flex items-center gap-2 text-xs text-[#0E2A47]">
                    <input type="checkbox" checked={relWaive} onChange={(e) => setRelWaive(e.target.checked)} />
                    Trusted key account — release without payment (Owner/Admin exception)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="min-w-[15rem] flex-1 rounded-xl border border-[#0E2A47]/15 bg-white px-2 py-1.5 text-sm" placeholder={relWaive ? "Authorization note (required for exception)" : "Authorization note (optional)"} value={relNote} onChange={(e) => setRelNote(e.target.value)} />
                    <button className={primaryBtn} disabled={busy || (!relWaive && !(paid > 0))} onClick={() => void doRelease()}>Release to Warehouse</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
