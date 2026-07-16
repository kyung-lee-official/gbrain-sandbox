import type { AppMemory, AppMessage } from './db.ts';

const MAX_CONTEXT_CHARS = 12_000;

/**
 * Build the question sent to gbrain `think` (shared knowledge only).
 * Personal memories are injected here so isolation stays in the app layer.
 */
export function buildThinkQuestion(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[] = [],
): string {
  const history = formatHistory(recentMessages);
  const personal = formatPersonalMemories(personalMemories);
  const parts = [
    'You are answering for a single user.',
    'Use shared brain knowledge from retrieval, plus any personal memory block below.',
    'Personal memory is private to this user; do not invent facts that are not present.',
    '',
  ];
  if (personal) {
    parts.push('Personal memory (private to this user only):', personal, '');
  }
  if (history) {
    parts.push('Recent conversation (for context only):', history, '');
  }
  parts.push('Current question:', userMessage.trim());
  return trimToMax(parts.join('\n'));
}

function formatHistory(messages: AppMessage[]): string {
  if (messages.length === 0) return '';
  return messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`)
    .join('\n');
}

function formatPersonalMemories(memories: AppMemory[]): string {
  if (memories.length === 0) return '';
  return memories.map((m) => `- [${m.slug}] ${m.content.trim()}`).join('\n');
}

function trimToMax(text: string): string {
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[context truncated]`;
}

export function slugForMemoryNote(now = new Date()): string {
  return `memory/note-${now.getTime()}`;
}
