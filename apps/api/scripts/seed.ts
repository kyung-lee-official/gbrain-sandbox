/**
 * Upsert demo users into app_users (requires Prisma-migrated app schema).
 */
import { SEED_USER_IDS } from "../src/config.ts";
import { closeDb, seedAppUsers } from "../src/db.ts";

async function main(): Promise<void> {
  console.log("Seeding app users...");
  const users = await seedAppUsers();
  for (const user of users) {
    console.log(`  user ${user.id}: api_key=${user.api_key}`);
  }
  console.log(
    `  (removed legacy bob if present; seed ids: ${SEED_USER_IDS.join(", ")})`,
  );
  await closeDb();
}

await main();
