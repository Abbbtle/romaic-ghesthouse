import type { Database } from "../database";
import type { PostgresDriver } from "../driver";

/**
 * Fresh databases for contract tests, one per call and isolated from every
 * other test: PGlite in memory for `npm test` (./pglite.ts), a real Postgres
 * server for `*.pg.test.ts` under `npm run test:postgres` (./postgres.ts).
 * A contract suite takes a TestDatabases and runs the same tests on either.
 *
 * Make one at the top level of a test file, never inside describe or a test:
 * it registers the file's clean-up hooks, which close (and on a server,
 * drop) every database a test opened once that test ends. Open databases
 * inside tests.
 */
export type TestDatabases = {
  /** For test titles: "PGlite" or "Postgres". */
  readonly label: string;
  /**
   * Whether transactions really run side by side. PGlite runs one at a
   * time, so tests of writes landing at the same moment skip there, rather
   * than passing whatever the locks do.
   */
  readonly concurrentTransactions: boolean;
  /** A fresh database with every registered migration applied. */
  migrated(): Database;
  /** A fresh database with nothing in it, not even schema app: for testing migrations. */
  empty(): PostgresDriver;
};

/** The test option that skips a test of simultaneous writes where they can't happen. */
export function whenConcurrent(databases: TestDatabases): { skip: string | false } {
  return { skip: databases.concurrentTransactions ? false : `transactions don't overlap in ${databases.label}` };
}
