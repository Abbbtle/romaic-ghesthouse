import type { PostgresDriver, SqlConnection } from "./driver";
import { advisoryLocks } from "./locks";

/**
 * One schema change: an id that says where it goes in the order, such as
 * "010-accounts", and the SQL that makes it. Each module's migrations live in
 * ./migrations and are listed, in order, in ./migrations/registry.ts.
 */
export type Migration = {
  readonly id: string;
  readonly sql: string;
};

// Three digits, then words: "001-core", "040-diary", "041-diary-notes".
const migrationId = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Refuses a list whose ids aren't well formed, unique and in ascending order: a mistake in the registry, caught before any SQL runs. */
export function checkMigrationOrder(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (!migrationId.test(migration.id)) throw new Error(`Migration id "${migration.id}" should look like "010-accounts".`);
    const previous = migrations[index - 1];
    if (previous && previous.id >= migration.id) {
      throw new Error(`Migration "${migration.id}" must come after "${previous.id}" in the registry, with a different id.`);
    }
  });
}

/**
 * Brings the schema up to date, once per database however many servers
 * start at the same moment: everything runs in one transaction that first
 * takes an advisory lock, so a second server waits, then finds the work done.
 * Pending migrations commit together or not at all, so a failing one leaves
 * the database as it was. (A statement that can't run inside a transaction,
 * such as CREATE INDEX CONCURRENTLY, can't be a migration here.)
 *
 * Returns the ids it applied, in order.
 */
export async function migrate(driver: PostgresDriver, migrations: readonly Migration[]): Promise<string[]> {
  checkMigrationOrder(migrations);
  return driver.transaction(async (connection) => {
    await connection.query("select pg_advisory_xact_lock($1)", [advisoryLocks.migrations]);
    const done = await appliedIds(connection);
    const pending = migrations.filter((migration) => !done.has(migration.id));
    for (const migration of pending) {
      await connection.runScript(migration.sql);
      await connection.query("insert into app.schema_migrations (id) values ($1)", [migration.id]);
    }
    return pending.map((migration) => migration.id);
  });
}

/** The ids already applied. Before the first migration there's no app schema, so nothing is. */
async function appliedIds(connection: SqlConnection): Promise<Set<string>> {
  const { rows: found } = await connection.query<{ present: boolean }>(
    "select to_regclass('app.schema_migrations') is not null as present",
    [],
  );
  if (!found[0]?.present) return new Set();
  const { rows } = await connection.query<{ id: string }>("select id from app.schema_migrations", []);
  return new Set(rows.map((row) => row.id));
}
