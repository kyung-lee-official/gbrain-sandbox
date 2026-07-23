"use client";

import Link from "next/link";
import type { AskMode } from "@/lib/api";
import { QUERY_TAB_ROUTES } from "@/lib/query-modes";

export function QueryModeTabs({ mode }: { mode: AskMode }) {
  return (
    <nav className="flex gap-1 border-line border-b" aria-label="Query mode">
      {QUERY_TAB_ROUTES.map((tab) => {
        const selected = tab.mode === mode;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.help}
            className={
              selected
                ? "border-accent border-b-2 px-3 py-2 font-mono text-accent text-sm"
                : "border-transparent border-b-2 px-3 py-2 font-mono text-muted text-sm hover:text-ink"
            }
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
