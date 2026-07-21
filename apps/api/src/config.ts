const DEFAULT_MCP_BASE = 'http://localhost:3131';

/** App session / memory tables; defaults to GBRAIN_DATABASE_URL when APP_DATABASE_URL is unset. */
export function appDatabaseUrl(): string {
  return (
    process.env.APP_DATABASE_URL?.trim() ||
    process.env.GBRAIN_DATABASE_URL?.trim() ||
    ''
  );
}

export function mcpBaseUrl(): string {
  const base = (process.env.GBRAIN_MCP_BASE_URL ?? DEFAULT_MCP_BASE).replace(/\/$/, '');
  return base;
}

export function mcpUrl(): string {
  const explicit = process.env.GBRAIN_MCP_URL?.trim();
  if (explicit) return explicit;
  return `${mcpBaseUrl()}/mcp`;
}

export function oauthTokenUrl(): string {
  const explicit = process.env.GBRAIN_OAUTH_TOKEN_URL?.trim();
  if (explicit) return explicit;
  return `${mcpBaseUrl()}/token`;
}

export function serverPort(): number {
  const raw = process.env.PORT ?? '3000';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) return 3000;
  return port;
}

/** Seeded into `app_users` by setup / empty-DB boot (ids are lowercase). */
export const SEED_USER_IDS = [
  'lily',
  'haewon',
  'sullyoon',
  'bae',
  'jiwoo',
  'kyujin',
] as const;

export type SeedUserId = (typeof SEED_USER_IDS)[number];

export function apiKeyForSeedUser(id: string): string {
  return `demo-key-${id}`;
}

export const SHARED_SOURCE_ID = 'shared-source';
export const SHARED_OAUTH_CLIENT_NAME = 'sandbox-shared';

export function chatModel(): string | undefined {
  const value = process.env.GBRAIN_CHAT_MODEL?.trim();
  return value || undefined;
}
