/**
 * Brings the database schema up to date: `npm run db:migrate`. Run it
 * against production before deploying a release that adds a migration, so a
 * failing migration stops the deploy instead of failing requests. (The site
 * also migrates on its own before its first statement, so forgetting isn't
 * fatal, just later.)
 *
 * It connects with DATABASE_URL_UNPOOLED, then DATABASE_URL, then the
 * Supabase integration's POSTGRES_URL_NON_POOLING and POSTGRES_URL, read
 * from the shell, .env.local or .env. With none of them it migrates the
 * local PGlite database: stop `next dev` first, since only one process may
 * open it at a time.
 */
import { migrate } from "../src/adapters/postgres/migrate";
import { migrations } from "../src/adapters/postgres/migrations/registry";
import { loadEnvFiles } from "../src/server/env";
import { failureReason, scriptDriver } from "../src/server/infrastructure";

async function main(): Promise<void> {
  loadEnvFiles();
  const { driver, target } = scriptDriver();
  console.log(`Migrating ${target}…`);
  try {
    const applied = await migrate(driver, migrations);
    console.log(applied.length > 0 ? `Applied ${applied.join(", ")}.` : "Already up to date.");
  } finally {
    await driver.close();
  }
}

main().catch((error: unknown) => {
  console.error(`The migration failed, and nothing was changed: ${failureReason(error)}`);
  process.exitCode = 1;
});
