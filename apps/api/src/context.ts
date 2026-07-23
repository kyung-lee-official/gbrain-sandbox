import type { AppMemory, AppMessage } from "./db.ts";

const MAX_CONTEXT_CHARS = 12_000;
const MAX_SHARED_PAGES_CHARS = 24_000;

export type SharedPageContext = {
  slug: string;
  title?: string;
  body: string;
};

/**
 * Build the synthesis prompt for Bun-side LLM (full shared pages via get_page hydrate).
 */
export function buildSynthesisPrompt(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[] = [],
  sharedPages: SharedPageContext[] = [],
): string {
  const history = formatHistory(recentMessages);
  const personal = formatPersonalMemories(personalMemories);
  const shared = formatSharedPages(sharedPages);
  const parts = [
    "You are answering for a single user.",
    "Use the shared brain pages below, plus any personal memory block.",
    "Personal memory is private to this user; do not invent facts that are not present.",
    "If shared pages do not contain the answer, say so clearly.",
    "",
  ];
  if (shared) {
    parts.push("Shared brain pages:", shared, "");
  }
  if (personal) {
    parts.push("Personal memory (private to this user only):", personal, "");
  }
  if (history) {
    parts.push("Recent conversation (for context only):", history, "");
  }
  parts.push("Current question:", userMessage.trim());
  return trimToMax(
    parts.join("\n"),
    MAX_CONTEXT_CHARS + MAX_SHARED_PAGES_CHARS,
  );
}

function formatSharedPages(pages: SharedPageContext[]): string {
  if (pages.length === 0) return "";
  return pages
    .map((p) => {
      const label = p.title?.trim() ? `${p.title.trim()} (${p.slug})` : p.slug;
      return `--- ${label} ---\n${p.body.trim()}`;
    })
    .join("\n\n");
}

function formatHistory(messages: AppMessage[]): string {
  if (messages.length === 0) return "";
  return messages
    .map(
      (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`,
    )
    .join("\n");
}

function formatPersonalMemories(memories: AppMemory[]): string {
  if (memories.length === 0) return "";
  return memories.map((m) => `- [${m.slug}] ${m.content.trim()}`).join("\n");
}

function trimToMax(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[context truncated]`;
}

export function slugForMemoryNote(now = new Date()): string {
  return `memory/note-${now.getTime()}`;
}
