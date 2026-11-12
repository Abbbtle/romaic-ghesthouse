import "server-only";
import type { ConnectionOptions } from "node:tls";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import { sessionTimeZone, type PostgresDriver, type SqlConnection } from "./driver";
import { supabaseRootCertificate } from "./supabase-ca";
import { typeParsers } from "./value-types";

export type PgPoolOptions = {
  /** A postgres:// URL, such as Supabase's transaction pooler (port 6543). */
  connectionString: string;
  /** Connections one server instance keeps open at most. Serverless instances need few. */
  maxConnections: number;
  /** The server's root certificate (PEM) when its CA isn't Supabase's or a public one. */
  caCertificate: string | null;
  /**
   * On Vercel, hands the pool to @vercel/functions, which lets idle
   * connections close before a function instance is suspended instead of
   * leaving them half-open on the database.
   */
  attachToVercelFunctions: boolean;
  /**
   * Told about a connection error no statement was waiting for: a
   * connection that failed while idle, or couldn't be set up. The pool
   * replaces that connection.
   */
  onConnectionError: (error: Error) => void;
};

/** What node-postgres is given: the URL without the parameters that would override `ssl`, and the TLS settings. */
export type PgConnectionSettings = { connectionString: string; ssl: false | ConnectionOptions; options?: string };

/**
 * URL parameters node-postgres would apply over the `ssl` object (it merges
 * them on top of the config), plus ones other tools add that mean nothing to
 * it. TLS is decided here from the host instead.
 */
const ignoredParameters = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslnegotiation",
  "uselibpqcompat",
  "pgbouncer",
  "connection_limit",
  "workaround",
];

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * TLS for a database URL, always verifying the server:
 * - localhost: no TLS (a development or test server on this machine), and
 *   the session set to UTC at startup: a Postgres of your own defaults to
 *   its machine's zone, and expressions such as now()::date follow it
 *   (hosted Postgres runs in UTC, and value reads never depend on the zone;
 *   see ./value-types.ts)
 * - Supabase (*.supabase.com, *.supabase.co): its certificates chain to
 *   Supabase's own root CA, which Node doesn't trust by default, so that root
 *   is supplied (or `caCertificate`, if set)
 * - anywhere else: Node's default CAs, or `caCertificate`
 *
 * Never "fixed" with rejectUnauthorized: false.
 */
export function pgConnectionSettings(connectionString: string, caCertificate: string | null): PgConnectionSettings {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // The URL itself may hold a password, so it isn't repeated here.
    throw new Error("The database connection string isn't a postgres:// URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("The database connection string must start with postgres:// or postgresql://.");
  }
  for (const name of ignoredParameters) url.searchParams.delete(name);
  const host = url.hostname.toLowerCase();
  if (localHosts.has(host)) return { connectionString: url.toString(), ssl: false, options: `-c TimeZone=${sessionTimeZone}` };
  const isSupabase = host.endsWith(".supabase.com") || host.endsWith(".supabase.co");
  const ca = caCertificate ?? (isSupabase ? supabaseRootCertificate : null);
  return { connectionString: url.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true } };
}

/** Rows as PostgresDriver promises them (see ./value-types.ts); node-postgres's own parsers for every other type. */
const types: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    typeParsers[oid] ?? pg.types.getTypeParser(oid, format ?? "text")) as pg.CustomTypesConfig["getTypeParser"],
};

/**
 * A connection pool for a hosted Postgres. Supabase's transaction pooler
 * gives each transaction any one of its server connections, so nothing
 * relies on session state: no named prepared statements, no session
 * advisory locks (see ./locks.ts).
 *
 * A local Postgres is set to UTC by a startup option (see
 * pgConnectionSettings), not by a query on each new connection: that query
 * ran alongside the connection's first statement, which node-postgres warns
 * about and its next major version refuses. Through Supabase's pooler a
 * session setting wouldn't stay with a connection anyway; Supabase runs in
 * UTC.
 */
export function createPgPool(options: PgPoolOptions): pg.Pool {
  const pool = new pg.Pool({
    ...pgConnectionSettings(options.connectionString, options.caCertificate),
    max: options.maxConnections,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // Without a listener, a connection the server closes while idle would crash the process.
  pool.on("error", options.onConnectionError);
  if (options.attachToVercelFunctions) attachDatabasePool(pool);
  return pool;
}

/**
 * The driver for node-postgres, over any pool. It reads result types per
 * statement, so the pool's own setup doesn't matter, and it sends every
 * statement unnamed, which transaction poolers need.
 */
export function createPgDriver(pool: pg.Pool): PostgresDriver {
  const connectionOf = (client: pg.Pool | pg.PoolClient): SqlConnection => ({
    async query(text, values) {
      const result = await client.query({ text, values: [...values], types });
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
    async runScript(script) {
      // Without parameters, node-postgres sends a simple query, which may hold several statements.
      await client.query(script);
    },
  });

  return {
    ...connectionOf(pool),

    async transaction(work) {
      const client = await pool.connect();
      // A connection that can't even roll back is dropped instead of going back to the pool.
      let broken: Error | undefined;
      try {
        await client.query("begin");
        const result = await work(connectionOf(client));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch((rollbackError: Error) => {
          broken = rollbackError;
        });
        throw error;
      } finally {
        client.release(broken);
      }
    },

    async close() {
      await pool.end();
    },
  };
}
