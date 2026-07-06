"use client";

import { useState } from "react";
import type {
  SalesReport,
  InventoryReport,
  ReceivablesReport,
} from "@/lib/reports";

const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#0E2A47]/10 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.06em] text-[#5B7186]">{label}</p>
      <p className="mt-0.5 font-serif text-2xl text-[#0E2A47]">{value}</p>
    </div>
  );
}

function AiAnalysis({ kind, data }: { kind: string; data: unknown }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reports/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, data }),
      });
      const d = (await res.json().catch(() => ({}))) as { analysis?: string; error?: string };
      setText(d.analysis ?? d.error ?? "No analysis returned.");
    } catch {
      setText("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-[#1668C7]/20 bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#1668C7]">AI analysis</p>
      {text ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-[#0E2A47]">{text}</p>
      ) : (
        <button
          onClick={() => void run()}
          disabled={busy}
          className="mt-1 rounded-full border border-[#0E2A47]/15 bg-[#F4F8FD] px-3 py-1.5 text-sm text-[#0E2A47] transition hover:bg-[#E4EEFA] disabled:opacity-50"
        >
          {busy ? "Analysing…" : "Analyse with AI"}
        </button>
      )}
    </div>
  );
}

export default function ReportsSection({
  sales,
  inventory,
  receivables,
}: {
  sales: SalesReport | null;
  inventory: InventoryReport | null;
  receivables: ReceivablesReport | null;
}) {
  return (
    <section className="space-y-8">
      <h2 className="font-serif text-2xl text-[#0E2A47]">Reports</h2>

      {sales && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#0E2A47]">
            Sales — last {sales.periodDays} days
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Stat label="Revenue" value={egp(sales.revenueEgp)} />
            <Stat label="Orders" value={String(sales.orderCount)} />
          </div>
          {sales.topProducts.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#0E2A47]/10 bg-white px-4 py-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5B7186]">Top products</p>
              {sales.topProducts.map((p) => (
                <p key={p.name} className="text-sm text-[#0E2A47]">{p.name} · {p.qty} sold</p>
              ))}
            </div>
          )}
          <AiAnalysis kind="sales" data={sales} />
        </div>
      )}

      {inventory && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#0E2A47]">Inventory</h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="SKUs" value={String(inventory.totalSkus)} />
            <Stat label="Units in stock" value={inventory.trackedUnits.toLocaleString("en-EG")} />
            <Stat label="Out of stock" value={String(inventory.outOfStock)} />
          </div>
          {inventory.lowStock.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#D6941F]/25 bg-[#F4F8FD] px-4 py-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8A5A12]">Low stock (≤5)</p>
              {inventory.lowStock.map((p) => (
                <p key={p.name} className="text-sm text-[#0E2A47]">{p.name} · {p.qty} left</p>
              ))}
            </div>
          )}
          <AiAnalysis kind="inventory" data={inventory} />
        </div>
      )}

      {receivables && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#0E2A47]">Receivables</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Outstanding" value={egp(receivables.outstandingEgp)} />
            <Stat label="Open" value={String(receivables.openCount)} />
            <Stat label="Overdue" value={String(receivables.overdueCount)} />
            <Stat label="Overdue amount" value={egp(receivables.overdueEgp)} />
          </div>
          <AiAnalysis kind="receivables" data={receivables} />
        </div>
      )}
    </section>
  );
}
