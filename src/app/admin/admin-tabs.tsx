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

export default function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.id ?? "");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Admin sections"
        className="mb-8 flex flex-wrap gap-1.5 rounded-xl border border-[#0E2A47]/10 bg-white/70 p-1.5 shadow-sm shadow-[#0E2A47]/5 backdrop-blur"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
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
                selected
                  ? "rounded-lg bg-[#1668C7] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#1668C7]/30"
                  : "rounded-lg px-3.5 py-2 text-sm font-medium text-[#5B7186] transition-colors hover:bg-[#E4EEFA] hover:text-[#1668C7]"
              }
            >
              {tab.label}
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
