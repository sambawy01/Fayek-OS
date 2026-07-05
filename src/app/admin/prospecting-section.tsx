"use client";

import { useState } from "react";
import type { Lead, LeadStatus } from "@/lib/leads";

const primaryBtn = "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50";
const subtleBtn = "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#C08A2D]/15 text-[#8A6418]",
  approved: "bg-[#357F75]/15 text-[#2A6A61]",
  rejected: "bg-[#B5483A]/12 text-[#B5483A]",
  sent: "bg-[#38492E]/10 text-[#5E6B4F]",
};

async function readError(res: Response): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return d.error ?? `Request failed (${res.status}).`;
}

export default function ProspectingSection({
  initialLeads, canRun,
}: {
  initialLeads: Lead[];
  canRun: boolean;
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = leads.reduce<Record<string, number>>((m, l) => { m[l.status] = (m[l.status] ?? 0) + 1; return m; }, {});
  const shown = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  async function runNow() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await fetch("/api/admin/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
      const data = (await res.json()) as { created?: Lead[]; error?: string; scanned?: number };
      if (!res.ok) { setError(data.error ?? "Discovery failed."); return; }
      const created = data.created ?? [];
      setLeads((prev) => [...created, ...prev]);
      setFilter("pending");
      setMsg(created.length > 0 ? `Found ${created.length} new lead${created.length === 1 ? "" : "s"} (scanned ${data.scanned ?? 0} sites).` : `No new leads this run (scanned ${data.scanned ?? 0} sites — already-seen companies are skipped).`);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function setStatus(id: number, status: LeadStatus) {
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) { setError(await readError(res)); return; }
      const { lead } = (await res.json()) as { lead: Lead };
      setLeads((prev) => prev.map((l) => l.id === lead.id ? lead : l));
    } catch { setError("Network error — please try again."); }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl text-[#38492E]">Prospecting</h2>
        {canRun && <button className={primaryBtn} disabled={busy} onClick={() => void runNow()}>{busy ? "Researching…" : "Run discovery now"}</button>}
      </div>
      <p className="mb-3 text-sm text-[#5E6B4F]">
        Every day the AI agent finds new potential customers across Egyptian industry, researches each one, and drafts a tailored branded outreach — ready here for your approval before sending.
      </p>

      {msg && <div className="mb-3 rounded-2xl border border-[#357F75]/30 bg-[#FBF4E6] px-4 py-2 text-sm text-[#2A6A61]">{msg}</div>}
      {error && <div className="mb-3 rounded-2xl border border-[#B5483A]/30 bg-[#FBF4E6] px-4 py-2 text-sm text-[#B5483A]">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize transition ${filter === f ? "bg-[#357F75] text-[#FBF4E6]" : "border border-[#38492E]/15 bg-[#FBF4E6] text-[#38492E] hover:bg-[#EFE7D6]"}`}>
            {f}{f !== "all" && counts[f] ? ` (${counts[f]})` : ""}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-8 text-center text-sm text-[#5E6B4F]">
            No {filter === "all" ? "" : filter} leads yet.{canRun && filter !== "rejected" ? " Use “Run discovery now” or wait for the daily run." : ""}
          </div>
        ) : shown.map((l) => <LeadCard key={l.id} lead={l} onStatus={setStatus} onError={setError} />)}
      </div>
    </section>
  );
}

function LeadCard({ lead, onStatus, onError }: { lead: Lead; onStatus: (id: number, s: LeadStatus) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([lead.draftHtml], { type: "text/html" }),
        "text/plain": new Blob([lead.draftBody], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } catch {
      await navigator.clipboard.writeText(lead.draftBody);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-[#38492E]/10 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#38492E]">{lead.companyName}</p>
          <p className="text-xs text-[#5E6B4F]">
            {lead.sector}{lead.location ? ` · ${lead.location}` : ""}
            {lead.website && <> · <a href={lead.website} target="_blank" rel="noreferrer" className="text-[#357F75] hover:underline">website</a></>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[lead.status] ?? ""}`}>{lead.status}</span>
      </div>

      {(lead.contactEmail || lead.contactPhone) && (
        <p className="mt-1 text-xs text-[#5E6B4F]">
          {lead.contactEmail && <>Email: <span className="text-[#38492E]">{lead.contactEmail}</span></>}
          {lead.contactEmail && lead.contactPhone && " · "}
          {lead.contactPhone && <>Phone: <span className="text-[#38492E]">{lead.contactPhone}</span></>}
        </p>
      )}
      {lead.rationale && <p className="mt-1 text-xs italic text-[#5E6B4F]">{lead.rationale}</p>}
      {lead.relevantProducts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lead.relevantProducts.map((p, i) => (
            <span key={i} className="rounded-full bg-[#38492E]/8 px-2 py-0.5 text-xs text-[#38492E]">{p}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lead.status === "pending" && (
          <>
            <button className={primaryBtn} onClick={() => onStatus(lead.id, "approved")}>Approve</button>
            <button className={subtleBtn} onClick={() => onStatus(lead.id, "rejected")}>Reject</button>
          </>
        )}
        {lead.status === "approved" && (
          <>
            <button className={primaryBtn} onClick={() => void copyEmail()}>{copied ? "Copied!" : "Copy branded email"}</button>
            <button className={subtleBtn} onClick={() => onStatus(lead.id, "sent")}>Mark sent</button>
          </>
        )}
        <button className={subtleBtn} onClick={() => setOpen(!open)}>{open ? "Hide draft" : "View draft"}</button>
      </div>

      {open && (
        <div className="mt-3 border-t border-[#38492E]/10 pt-3">
          <p className="mb-2 text-sm font-medium text-[#38492E]">Subject: {lead.draftSubject}</p>
          <div className="overflow-hidden rounded-xl border border-[#38492E]/10">
            <iframe title={`Draft for ${lead.companyName}`} srcDoc={lead.draftHtml} className="h-[440px] w-full bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
