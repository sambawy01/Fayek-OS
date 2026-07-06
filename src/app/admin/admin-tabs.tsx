"use client";

import { useState, useEffect, type ReactNode } from "react";

/**
 * Two-level tab nav for /admin. The server passes a flat list of already-rendered
 * tabs; this groups them into top-level categories (Sales / Inventory / Finance /
 * Owner-Admin) with polished sub-tab buttons under the active category. Hidden
 * panels keep their client state (drafts, inline edits) intact.
 */
export interface AdminTab {
  id: string;
  label: string;
  node: ReactNode;
}

/** Which category each section belongs to. */
const GROUP_OF: Record<string, string> = {
  orders: "sales",
  purchaseOrders: "sales",
  quotations: "sales",
  prospecting: "sales",
  customers: "sales",
  inventory: "inventory",
  dispatch: "factory",
  production: "factory",
  factoryWarehouse: "factory",
  receiving: "inventory",
  clientDispatch: "inventory",
  finance: "finance",
  reports: "admin",
  approvals: "admin",
  productionOrders: "admin",
  users: "admin",
};
const groupOf = (id: string) => GROUP_OF[id] ?? "admin";
const GROUPS: { id: string; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "factory", label: "Factory" },
  { id: "finance", label: "Finance" },
  { id: "admin", label: "Owner / Admin" },
];

/** Compact stroke icons per section (industrial nav). 16px, currentColor. */
const Icon = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  orders: Icon("M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2|M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2|M9 12h6|M9 16h6"),
  inventory: Icon("M20 7 12 3 4 7l8 4 8-4Z|M4 7v10l8 4 8-4V7|M12 11v10"),
  finance: Icon("M12 2v20|M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"),
  customers: Icon("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13A4 4 0 0 1 16 11"),
  purchaseOrders: Icon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z|M14 2v6h6|M9 13h6|M9 17h6"),
  quotations: Icon("M4 4h16v12H8l-4 4Z|M8 9h8|M8 12h5"),
  prospecting: Icon("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z|m21 21-4.3-4.3|M11 8v6|M8 11h6"),
  dispatch: Icon("M1 3h15v13H1z|M16 8h4l3 3v5h-7|M5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm13 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"),
  production: Icon("M2 20h20|M4 20V9l6 4V9l6 4V6l4 3v11|M8 20v-4|M14 20v-4"),
  productionOrders: Icon("M2 20h20|M4 20V9l6 4V9l6 4V6l4 3v11|M8 20v-4|M14 20v-4"),
  factoryWarehouse: Icon("M3 21V8l9-5 9 5v13|M3 21h18|M9 21v-6h6v6|M7 11h.01|M12 11h.01|M17 11h.01"),
  clientDispatch: Icon("M1 3h15v13H1z|M16 8h4l3 3v5h-7|M5.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm13 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"),
  receiving: Icon("M16 3h5v13H2V3h5|M2 8h19|M9 3v5m6-5v5|M8 16v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3"),
  reports: Icon("M3 3v18h18|M7 15l4-4 3 3 5-6"),
  approvals: Icon("M9 12l2 2 4-4|M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6Z"),
  users: Icon("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M19 8v6M22 11h-6"),
};

/** Pull a trailing "(3)" count off a label so it renders as a badge. */
function splitBadge(label: string): { text: string; badge: number } {
  const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(label);
  return m ? { text: m[1], badge: Number(m[2]) } : { text: label, badge: 0 };
}

export default function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActiveState] = useState<string>(tabs[0]?.id ?? "");

  // Restore the open tab from the URL hash after a full page reload. (Starts on
  // the first tab to match the server render, then syncs to the hash on mount —
  // avoids a hydration mismatch.)
  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.slice(1));
    if (fromHash && tabs.some((t) => t.id === fromHash)) setActiveState(fromHash);
  }, [tabs]);

  // Selecting a tab records it in the URL (replaceState = no new history entry),
  // so a reload lands on the same tab instead of jumping to the first one.
  const setActive = (id: string) => {
    setActiveState(id);
    try { window.history.replaceState(null, "", `#${encodeURIComponent(id)}`); } catch { /* ignore */ }
  };

  const activeGroup = groupOf(active);

  const groupTabs = (gid: string) => tabs.filter((t) => groupOf(t.id) === gid);
  const presentGroups = GROUPS.filter((g) => groupTabs(g.id).length > 0);
  const groupBadge = (gid: string) => groupTabs(gid).reduce((n, t) => n + splitBadge(t.label).badge, 0);
  const currentTabs = groupTabs(activeGroup);

  return (
    <div>
      {/* Top-level category nav */}
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-2xl border border-[#0E2A47]/10 bg-white p-1.5 shadow-sm shadow-[#0E2A47]/5">
        {presentGroups.map((g) => {
          const selected = g.id === activeGroup;
          const nb = groupBadge(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setActive(groupTabs(g.id)[0].id)}
              className={
                "relative rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors " +
                (selected ? "bg-[#0E2A47] text-white" : "text-[#5B7186] hover:bg-[#EEF3F9] hover:text-[#0E2A47]")
              }
            >
              {g.label}
              {nb > 0 && (
                <span className={"ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold " + (selected ? "bg-white/25 text-white" : "bg-[#CC4038] text-white")}>
                  {nb}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab nav (only when the category has more than one section) */}
      {currentTabs.length > 1 && (
        <div role="tablist" aria-label="Sections" className="mb-8 flex flex-wrap gap-2">
          {currentTabs.map((tab) => {
            const selected = tab.id === active;
            const { text, badge } = splitBadge(tab.label);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(tab.id)}
                className={
                  "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all " +
                  (selected
                    ? "bg-[#1668C7] text-white shadow-md shadow-[#1668C7]/25"
                    : "border border-[#0E2A47]/12 bg-white text-[#5B7186] shadow-sm shadow-[#0E2A47]/5 hover:-translate-y-0.5 hover:border-[#1668C7]/40 hover:text-[#1668C7] hover:shadow-md hover:shadow-[#1668C7]/10")
                }
              >
                <span className={selected ? "text-white" : "text-[#8CA0B6] group-hover:text-[#1668C7]"}>{ICONS[tab.id] ?? null}</span>
                <span>{text}</span>
                {badge > 0 && (
                  <span className={"ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold " + (selected ? "bg-white/25 text-white" : "bg-[#CC4038] text-white")}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {currentTabs.length <= 1 && <div className="mb-6" />}

      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" hidden={tab.id !== active}>
          {tab.node}
        </div>
      ))}
    </div>
  );
}
