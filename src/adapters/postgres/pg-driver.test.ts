import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPgPool, pgConnectionSettings, type PgPoolOptions } from "./pg-driver";
import { supabaseRootCertificate } from "./supabase-ca";

describe("createPgPool", () => {
  // Pools connect on first use, so none of these reaches a server.
  const options: PgPoolOptions = {
    connectionString: "postgres://romaic@localhost:5432/romaic?sslmode=require",
    maxConnections: 3,
    caCertificate: null,
    attachToVercelFunctions: false,
    onConnectionError: () => {},
  };

  it("hands the pool to Vercel's functions, which close idle connections before an instance sleeps, only on Vercel", async () => {
    const onVercel = createPgPool({ ...options, attachToVercelFunctions: true });
    const elsewhere = createPgPool(options);
    assert.equal(onVercel.listenerCount("release"), 1);
    assert.equal(elsewhere.listenerCount("release"), 0);
    await Promise.all([onVercel.end(), elsewhere.end()]);
  });

  it("keeps to DATABASE_POOL_MAX connections, starts local sessions in UTC, and listens for connection errors", async () => {
    const pool = createPgPool(options);
    assert.equal(pool.options.max, 3);
    assert.equal(pool.options.ssl, false, "localhost, without the URL's sslmode");
    assert.equal(pool.options.options, "-c TimeZone=UTC", "a startup option, not a query racing the first statement");
    assert.equal(pool.listenerCount("connect"), 0);
    assert.equal(pool.listenerCount("error"), 1, "an idle connection's error would otherwise crash the process");
    await pool.end();
  });
});

describe("pgConnectionSettings", () => {
  const pooler = "postgres://postgres.abcd:p%40ss@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

  it("verifies Supabase against its own root CA, dropping URL parameters that would override it", () => {
    const settings = pgConnectionSettings(`${pooler}?sslmode=require&pgbouncer=true&connection_limit=1&workaround=supabase-pooler.vercel`, null);
    assert.equal(settings.connectionString, pooler);
    assert.deepEqual(settings.ssl, { ca: supabaseRootCertificate, rejectUnauthorized: true });
    assert.equal(settings.options, undefined, "no startup options for the pooler: hosted Postgres runs in UTC");
    assert.deepEqual(pgConnectionSettings("postgres://u:p@db.abcd.supabase.co:5432/postgres?sslrootcert=/x.crt", null).ssl, {
      ca: supabaseRootCertificate,
      rejectUnauthorized: true,
    });
  });

  it("verifies any other host with Node's default CAs, or the one given", () => {
    assert.deepEqual(pgConnectionSettings("postgres://u:p@db.example.com/app?ssl=true&sslmode=no-verify", null), {
      connectionString: "postgres://u:p@db.example.com/app",
      ssl: { rejectUnauthorized: true },
    });
    assert.deepEqual(pgConnectionSettings("postgres://u:p@db.example.com/app", "PEM").ssl, { ca: "PEM", rejectUnauthorized: true });
    assert.deepEqual(pgConnectionSettings(pooler, "PEM").ssl, { ca: "PEM", rejectUnauthorized: true }, "DATABASE_CA_CERT wins");
  });

  it("connects to this machine without TLS, keeping other parameters", () => {
    assert.deepEqual(pgConnectionSettings("postgres://postgres@localhost:54329/romaic_test?options=-c%20search_path%3Dx", null), {
      connectionString: "postgres://postgres@localhost:54329/romaic_test?options=-c+search_path%3Dx",
      ssl: false,
      // node-postgres lets the URL's own options win over this default.
      options: "-c TimeZone=UTC",
    });
    assert.equal(pgConnectionSettings("postgresql://postgres@127.0.0.1/db", null).ssl, false);
  });

  it("refuses something that isn't a postgres:// URL, without repeating it", () => {
    assert.throws(() => pgConnectionSettings("host=db password=hunter2", null), (error: Error) => !error.message.includes("hunter2"));
    assert.throws(() => pgConnectionSettings("mysql://u:p@db/app", null), /postgres:\/\//);
  });
});
