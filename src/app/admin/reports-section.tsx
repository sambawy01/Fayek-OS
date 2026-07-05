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
    <div className="rounded-xl border border-[#38492E]/10 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.06em] text-[#5E6B4F]">{label}</p>
      <p className="mt-0.5 font-serif text-2xl text-[#38492E]">{value}</p>
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
    <div className="mt-3 rounded-xl border border-[#357F75]/20 bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#357F75]">AI analysis</p>
      {text ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-[#38492E]">{text}</p>
      ) : (
        <button
          onClick={() => void run()}
          disabled={busy}
          className="mt-1 rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6] disabled:opacity-50"
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
      <h2 className="font-serif text-2xl text-[#38492E]">Reports</h2>

      {sales && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#38492E]">
            Sales — last {sales.periodDays} days
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Stat label="Revenue" value={egp(sales.revenueEgp)} />
            <Stat label="Orders" value={String(sales.orderCount)} />
          </div>
          {sales.topProducts.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#38492E]/10 bg-white px-4 py-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#5E6B4F]">Top products</p>
              {sales.topProducts.map((p) => (
                <p key={p.name} className="text-sm text-[#38492E]">{p.name} · {p.qty} sold</p>
              ))}
            </div>
          )}
          <AiAnalysis kind="sales" data={sales} />
        </div>
      )}

      {inventory && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#38492E]">Inventory</h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="SKUs" value={String(inventory.totalSkus)} />
            <Stat label="Units in stock" value={inventory.trackedUnits.toLocaleString("en-EG")} />
            <Stat label="Out of stock" value={String(inventory.outOfStock)} />
          </div>
          {inventory.lowStock.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#C08A2D]/25 bg-[#FBF4E6] px-4 py-3">
              <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8A6418]">Low stock (≤5)</p>
              {inventory.lowStock.map((p) => (
                <p key={p.name} className="text-sm text-[#38492E]">{p.name} · {p.qty} left</p>
              ))}
            </div>
          )}
          <AiAnalysis kind="inventory" data={inventory} />
        </div>
      )}

      {receivables && (
        <div>
          <h3 className="mb-3 font-serif text-lg text-[#38492E]">Receivables</h3>
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
