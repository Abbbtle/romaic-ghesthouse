/**
 * What the Postgres adapter needs from a driver, so the same stores run on
 * Supabase through node-postgres and on PGlite (Postgres inside this process)
 * in development and tests. Statements take positional parameters ($1, $2,
 * …); ./database.ts puts named ones on top.
 *
 * Every driver returns rows the same way, and the stores rely on it: see
 * ./value-types.ts for how each column type reads.
 */

/**
 * The time zone every driver's sessions run in, whatever the server's or
 * this machine's default, so SQL such as now()::date means the same on each.
 */
export const sessionTimeZone = "UTC";

/** A value a statement parameter can take, as a driver sends it. Arrays bind as Postgres arrays. */
export type SqlValue = string | number | boolean | null | Uint8Array | readonly string[] | readonly number[];

/** Rows a statement returned, and how many rows it changed or returned. */
export type QueryResult<Row> = { rows: Row[]; rowCount: number };

/** Runs statements. */
export interface SqlConnection {
  query<Row>(text: string, values: readonly SqlValue[]): Promise<QueryResult<Row>>;
  /**
   * Runs several statements at once, such as a migration. It takes no
   * parameters, so only ever pass it SQL written in this codebase.
   */
  runScript(script: string): Promise<void>;
}

/**
 * A database's driver. Its own statements may each run on a different
 * pooled connection; only a transaction's statements share one session.
 */
export interface PostgresDriver extends SqlConnection {
  /**
   * Runs `work` on one connection inside a transaction: it commits when
   * `work` resolves and rolls back when it throws.
   */
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * A driver for a database that's still being opened, such as PGlite loading
 * its WebAssembly or a test database being created: every call waits for it.
 */
export function deferredDriver(ready: Promise<PostgresDriver>): PostgresDriver {
  return {
    query: async (text, values) => (await ready).query(text, values),
    runScript: async (script) => (await ready).runScript(script),
    transaction: async (work) => (await ready).transaction(work),
    close: async () => (await ready).close(),
  };
}
