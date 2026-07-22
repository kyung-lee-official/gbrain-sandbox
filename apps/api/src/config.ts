const DEFAULT_MCP_BASE = "http://localhost:3131";

/** Bun/Prisma app database — required; never falls back to gbrain. */
export function appDatabaseUrl(): string {
  return process.env.APP_DATABASE_URL?.trim() || "";
}

export function requireAppDatabaseUrl(): string {
  const url = appDatabaseUrl();
  if (!url) {
    throw new Error(
      "Missing APP_DATABASE_URL (e.g. postgresql://…/gbrain_app). App and gbrain DBs are separate.",
    );
  }
  return url;
}

export function mcpBaseUrl(): string {
  const base = (process.env.GBRAIN_MCP_BASE_URL ?? DEFAULT_MCP_BASE).replace(
    /\/$/,
    "",
  );
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
  const raw = process.env.PORT ?? "3132";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) return 3132;
  return port;
}

/** Seeded into `app_users` by `bun run seed` (ids are lowercase). */
export const SEED_USER_IDS = [
  "lily",
  "haewon",
  "sullyoon",
  "bae",
  "jiwoo",
  "kyujin",
] as const;

export type SeedUserId = (typeof SEED_USER_IDS)[number];

export function apiKeyForSeedUser(id: string): string {
  return `demo-key-${id}`;
}

/** Demo OAuth client name (register manually via gbrain CLI — see README). */
export const SHARED_OAUTH_CLIENT_NAME = "sandbox-shared";

export function chatModel(): string | undefined {
  const value = process.env.GBRAIN_CHAT_MODEL?.trim();
  return value || undefined;
}
