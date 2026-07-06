"use client";

import { useState } from "react";
import type { Approval } from "@/lib/approvals";

interface DiscLine { name: string; expectedQty: number; receivedQty: number; diff: number }
interface DiscDetail { reference?: string; supplier?: string; lines?: DiscLine[] }

const primaryBtn =
  "rounded-full bg-[#1668C7] px-4 py-2 text-sm font-medium text-[#F4F8FD] transition hover:opacity-90 disabled:opacity-50";
const dangerBtn =
  "rounded-full border border-[#CC4038]/40 bg-[#F4F8FD] px-4 py-2 text-sm font-medium text-[#CC4038] transition hover:bg-[#FBEAE8] disabled:opacity-50";
const subtleBtn =
  "rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50";

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function ApprovalsSection({
  initialApprovals,
}: {
  initialApprovals: Approval[];
}) {
  const [approvals, setApprovals] = useState<Approval[]>(initialApprovals);
  const [error, setError] = useState<string | null>(null);

  const pending = approvals.filter((a) => a.status === "pending");

  return (
    <section>
      <h2 className="font-serif text-2xl text-[#0E2A47]">Approvals &amp; Decisions</h2>
      <p className="mt-1 text-sm text-[#5B7186]">
        Pending requests and escalated issues, with executive AI recommendations.
      </p>

      {error && (
        <div className="mt-4 rounded-2xl border border-[#CC4038]/30 bg-[#F4F8FD] px-5 py-3 text-sm text-[#CC4038]">{error}</div>
      )}

      {pending.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">
          Nothing pending. Escalated batch discrepancies will appear here.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a}
              onDecided={(id) => setApprovals((prev) => prev.filter((x) => x.id !== id))}
              onError={setError} />
          ))}
        </div>
      )}
    </section>
  );
}

function ApprovalCard({
  approval, onDecided, onError,
}: {
  approval: Approval; onDecided: (id: number) => void; onError: (m: string) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(approval.aiRecommendation);
  const detail = (approval.detail ?? {}) as DiscDetail;

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/approvals/${approval.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) return onError("Add a note explaining the rejection.");
    setBusy(true);
    try { await post({ decision, note }); onDecided(approval.id); }
    catch (e) { onError(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  async function getRec() {
    setBusy(true);
    try {
      const data = (await post({ action: "recommend" })) as { recommendation?: string };
      setRec(data.recommendation ?? "");
    } catch (e) { onError(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <article className="rounded-2xl border border-[#CC4038]/25 bg-[#F4F8FD] px-5 py-4">
      <p className="text-sm font-medium text-[#0E2A47]">{approval.title}</p>
      {(detail.supplier || detail.reference) && (
        <p className="text-xs text-[#5B7186]">
          {[detail.supplier, detail.reference].filter(Boolean).join(" · ")}
        </p>
      )}

      {detail.lines && detail.lines.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.06em] text-[#5B7186]">
              <th className="pb-1">Product</th><th className="pb-1 text-center">Expected</th>
              <th className="pb-1 text-center">Received</th><th className="pb-1 text-center">Diff</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l, i) => (
              <tr key={i} className="border-t border-[#0E2A47]/5">
                <td className="py-1.5 text-[#0E2A47]">{l.name}</td>
                <td className="py-1.5 text-center text-[#5B7186]">{l.expectedQty}</td>
                <td className="py-1.5 text-center text-[#0E2A47]">{l.receivedQty}</td>
                <td className={`py-1.5 text-center font-medium ${l.diff === 0 ? "text-[#5B7186]" : "text-[#CC4038]"}`}>
                  {l.diff > 0 ? `+${l.diff}` : l.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 rounded-xl border border-[#1668C7]/20 bg-white px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#1668C7]">Executive AI recommendation</p>
        {rec ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#0E2A47]">{rec}</p>
        ) : (
          <button className={`${subtleBtn} mt-1`} disabled={busy} onClick={() => void getRec()}>
            {busy ? "Thinking…" : "Get AI recommendation"}
          </button>
        )}
      </div>

      <input className="mt-3 w-full rounded-xl border border-[#0E2A47]/15 bg-white px-3 py-2 text-sm text-[#0E2A47] outline-none focus:border-[#1668C7]"
        placeholder="Decision note (required to reject)…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={primaryBtn} disabled={busy} onClick={() => void decide("approve")}>
          Approve — accept received into stock
        </button>
        <button className={dangerBtn} disabled={busy} onClick={() => void decide("reject")}>
          Reject
        </button>
      </div>
    </article>
  );
}
