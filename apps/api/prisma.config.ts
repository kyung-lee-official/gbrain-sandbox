import { defineConfig } from "prisma/config";

/**
 * Prisma CLI datasource — APP_DATABASE_URL only (never gbrain).
 * Load env via `bun --env-file=../../.env` (see package.json scripts).
 */
function databaseUrl(): string {
  const url = process.env.APP_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Set APP_DATABASE_URL for Prisma (e.g. postgresql://…/gbrain_app). Use bun run prisma / prisma:generate from apps/api.",
    );
  }
  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl(),
  },
});
