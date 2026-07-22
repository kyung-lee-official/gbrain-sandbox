import { PrismaPg } from "@prisma/adapter-pg";
import { requireAppDatabaseUrl } from "./config.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prisma) return prisma;

  const adapter = new PrismaPg({
    connectionString: requireAppDatabaseUrl(),
  });
  prisma = new PrismaClient({ adapter });
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}
