"use client";

import { useState, type ReactNode } from "react";

/**
 * Client-side tab switcher for /admin. The server decides which tabs a role may
 * see and passes them in already-rendered; this only toggles visibility (hidden
 * panels keep their client state — drafts, inline edits — intact).
 */
export interface AdminTab {
  id: string;
  label: string;
  node: ReactNode;
}

/** Compact stroke icons per section (industrial nav). 16px, currentColor. */
const I = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  orders: I("M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2|M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2|M9 12h6|M9 16h6"),
  inventory: I("M20 7 12 3 4 7l8 4 8-4Z|M4 7v10l8 4 8-4V7|M12 11v10"),
  finance: I("M12 2v20|M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"),
  customers: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13A4 4 0 0 1 16 11"),
  purchaseOrders: I("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z|M14 2v6h6|M9 13h6|M9 17h6"),
  quotations: I("M4 4h16v12H8l-4 4Z|M8 9h8|M8 12h5"),
  prospecting: I("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z|m21 21-4.3-4.3|M11 8v6|M8 11h6"),
  receiving: I("M16 3h5v13H2V3h5|M2 8h19|M9 3v5m6-5v5|M8 16v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3"),
  reports: I("M3 3v18h18|M7 15l4-4 3 3 5-6"),
  approvals: I("M9 12l2 2 4-4|M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6Z"),
  users: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M19 8v6M22 11h-6"),
};

/** Pull a trailing "(3)" count off a label so it can render as a badge. */
function splitBadge(label: string): { text: string; badge: string | null } {
  const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(label);
  return m ? { text: m[1], badge: m[2] } : { text: label, badge: null };
}

export default function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.id ?? "");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Admin sections"
        className="mb-8 flex flex-wrap gap-2"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          const { text, badge } = splitBadge(tab.label);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`admin-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={
                "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all " +
                (selected
                  ? "bg-[#1668C7] text-white shadow-md shadow-[#1668C7]/25"
                  : "border border-[#0E2A47]/12 bg-white text-[#5B7186] shadow-sm shadow-[#0E2A47]/5 hover:-translate-y-0.5 hover:border-[#1668C7]/40 hover:text-[#1668C7] hover:shadow-md hover:shadow-[#1668C7]/10")
              }
            >
              <span className={selected ? "text-white" : "text-[#8CA0B6] group-hover:text-[#1668C7]"}>
                {ICONS[tab.id] ?? null}
              </span>
              <span>{text}</span>
              {badge && (
                <span
                  className={
                    "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold " +
                    (selected ? "bg-white/25 text-white" : "bg-[#CC4038] text-white")
                  }
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`admin-panel-${tab.id}`}
          aria-labelledby={`admin-tab-${tab.id}`}
          hidden={tab.id !== active}
        >
          {tab.node}
        </div>
      ))}
    </div>
  );
}
