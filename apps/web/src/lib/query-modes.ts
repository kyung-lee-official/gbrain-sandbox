import type { AskMode } from "@/lib/api";

/** UI path segment → API `POST /query` mode */
export const QUERY_TAB_ROUTES = [
  {
    href: "/ask",
    label: "ask",
    mode: "think" as const satisfies AskMode,
    help: "retrieve with gbrain, synthesize with LLM",
  },
  {
    href: "/query",
    label: "query",
    mode: "query" as const satisfies AskMode,
    help: "gbrain query — hybrid retrieval (vector + keyword), no LLM",
  },
  {
    href: "/search",
    label: "search",
    mode: "search" as const satisfies AskMode,
    help: "gbrain search — keyword / BM25 retrieval, no LLM",
  },
] as const;

export type QueryTabRoute = (typeof QUERY_TAB_ROUTES)[number];

export function tabByMode(mode: AskMode): QueryTabRoute {
  const tab = QUERY_TAB_ROUTES.find((t) => t.mode === mode);
  if (!tab) throw new Error(`Unknown query mode: ${mode}`);
  return tab;
}

export function modeLabel(mode: AskMode): string {
  return tabByMode(mode).label;
}
