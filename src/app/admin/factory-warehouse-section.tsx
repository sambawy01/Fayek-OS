"use client";

import { useState, useEffect } from "react";
import type { ProductionOrder } from "@/lib/production";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-[#1668C7]/15 text-[#0E7490]",
  in_production: "bg-[#357F75]/15 text-[#357F75]",
};

function due(deadlineIso: string | null): { text: string; cls: string } | null {
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  const abs = Math.abs(ms), d = Math.floor(abs / 86_400_000), h = Math.floor((abs % 86_400_000) / 3_600_000);
  const span = d > 0 ? `${d}d ${h}h` : `${h}h`;
  return ms < 0 ? { text: `overdue ${span}`, cls: "bg-[#CC4038]/12 text-[#CC4038]" }
    : ms < 2 * 86_400_000 ? { text: `due in ${span}`, cls: "bg-[#D6941F]/15 text-[#8A5A12]" }
    : { text: `due in ${span}`, cls: "bg-[#357F75]/12 text-[#357F75]" };
}

/**
 * Factory Warehouse (raw materials). Placeholder view: it receives the same
 * approved/in-production orders as the factory, so the raw-material store knows
 * what to supply. Detailed raw-material stock + consumption tracking is a later
 * design pass.
 */
export default function FactoryWarehouseSection({ initialOrders }: { initialOrders: ProductionOrder[] }) {
  const [orders, setOrders] = useState<ProductionOrder[]>(initialOrders);
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);
  const queue = orders.filter((o) => o.status === "approved" || o.status === "in_production");

  return (
    <section>
      <h2 className="font-serif text-2xl text-[#0E2A47]">Factory Warehouse — Raw Materials</h2>
      <p className="mt-1 text-sm text-[#5B7186]">
        Approved production orders the raw-material store must supply to the factory.
        <span className="ml-1 rounded-full bg-[#D6941F]/15 px-2 py-0.5 text-xs text-[#8A5A12]">Raw-material stock tracking coming soon</span>
      </p>
      <div className="mt-4 space-y-2">
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0E2A47]/15 bg-[#F4F8FD]/60 px-6 py-8 text-center text-sm text-[#5B7186]">No production in the queue.</div>
        ) : queue.map((o) => {
          const c = due(o.deadline);
          return (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#0E2A47]/10 bg-white px-4 py-3">
              <p className="text-sm font-medium text-[#0E2A47]">PRD-{o.id} · {o.name || o.slug} · {o.qty} units</p>
              <div className="flex items-center gap-2">
                {c && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.cls}`}>{c.text}</span>}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status] ?? ""}`}>{o.status === "in_production" ? "in production" : "approved"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
