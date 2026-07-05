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
        className="mb-8 flex flex-wrap gap-2 border-b border-[#38492E]/10 pb-3"
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
                  ? "rounded-full bg-[#357F75] px-4 py-2 text-sm font-medium text-[#FBF4E6]"
                  : "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-4 py-2 text-sm font-medium text-[#38492E] transition-colors hover:bg-[#EFE7D6]"
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
