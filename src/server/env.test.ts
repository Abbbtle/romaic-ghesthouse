import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { createServerEnv } from "./env";

describe("the server's environment", () => {
  it("works with nothing set, as on a developer's machine, counting empty values as unset", () => {
    const env = createServerEnv({ DATABASE_URL: "", ADMIN_SETUP_TOKEN: "   ", CLIENT_IP_HEADER: "" });
    assert.equal(env.isProduction(), false);
    assert.equal(env.onVercel(), false);
    assert.equal(env.isBuilding(), false);
    assert.equal(env.siteUrl(), "http://localhost:3000");
    assert.equal(env.databaseUrl(), null, "PGlite");
    assert.equal(env.scriptDatabaseUrl(), null);
    assert.equal(env.databasePoolMax(), 3);
    assert.equal(env.databaseCaCertificate(), null);
    assert.equal(env.pgliteDataDir(), path.resolve("data.nosync/pglite"));
    assert.equal(env.adminSetupToken(), null);
    assert.equal(env.visitorKeySecret(), null, "a random one per process");
    assert.equal(env.clientIpHeader(), "x-forwarded-for");
    assert.deepEqual(env.resend(), { status: "missing" });
    assert.equal(env.cronSecret(), null);
    assert.equal(env.adminHost(), null, "the dashboard lives under /admin on the site's host");
    assert.match(env.dataEncryptionKeys(), /^dev:/, "a fixed, public key in development only");
  });

  it("reads what's set, trimmed", () => {
    const env = createServerEnv({
      NODE_ENV: "production",
      VERCEL: "1",
      NEXT_PHASE: "phase-production-build",
      NEXT_PUBLIC_SITE_URL: " https://www.romaicguesthouse.co.za ",
      DATABASE_POOL_MAX: "5",
      PGLITE_DATA_DIR: "/tmp/romaic-pglite",
      ADMIN_SETUP_TOKEN: "setup-token",
      VISITOR_KEY_SECRET: "visitor-secret",
      CLIENT_IP_HEADER: "X-Real-IP",
      CRON_SECRET: "cron-secret",
      DATA_ENCRYPTION_KEY: "k1:ZGV2ZWxvcG1lbnQta2V5LW5vdC1zZWNyZXQtMzJieXQ=",
      ADMIN_HOST: "admin.romaicguesthouse.co.za",
    });
    assert.equal(env.isProduction(), true);
    assert.equal(env.onVercel(), true);
    assert.equal(env.isBuilding(), true);
    assert.equal(env.siteUrl(), "https://www.romaicguesthouse.co.za");
    assert.equal(
      createServerEnv({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "romaic-guesthouse.vercel.app" }).siteUrl(),
      "https://romaic-guesthouse.vercel.app",
      "without NEXT_PUBLIC_SITE_URL, Vercel's production domain, never localhost",
    );
    assert.equal(env.databasePoolMax(), 5);
    assert.equal(env.pgliteDataDir(), "/tmp/romaic-pglite");
    assert.equal(env.adminSetupToken(), "setup-token");
    assert.equal(env.visitorKeySecret(), "visitor-secret");
    assert.equal(env.clientIpHeader(), "x-real-ip", "header names in lower case, as Headers.get takes them");
    assert.equal(env.cronSecret(), "cron-secret");
    assert.equal(env.dataEncryptionKeys(), "k1:ZGV2ZWxvcG1lbnQta2V5LW5vdC1zZWNyZXQtMzJieXQ=");
    assert.equal(env.adminHost(), "admin.romaicguesthouse.co.za");
    assert.throws(() => createServerEnv({ NODE_ENV: "production" }).dataEncryptionKeys(), /DATA_ENCRYPTION_KEY/, "production refuses the development key");
  });

  it("takes the site's database from DATABASE_URL, or the Supabase integration's POSTGRES_URL", () => {
    assert.equal(createServerEnv({ DATABASE_URL: "postgres://a", POSTGRES_URL: "postgres://b" }).databaseUrl(), "postgres://a");
    assert.equal(createServerEnv({ POSTGRES_URL: "postgres://b" }).databaseUrl(), "postgres://b");
  });

  it("gives scripts a direct connection where there is one, else the site's", () => {
    const all = {
      DATABASE_URL_UNPOOLED: "postgres://direct",
      POSTGRES_URL_NON_POOLING: "postgres://integration-direct",
      DATABASE_URL: "postgres://pooled",
      POSTGRES_URL: "postgres://integration-pooled",
    };
    assert.equal(createServerEnv(all).scriptDatabaseUrl(), "postgres://direct");
    assert.equal(createServerEnv({ ...all, DATABASE_URL_UNPOOLED: "" }).scriptDatabaseUrl(), "postgres://integration-direct");
    assert.equal(createServerEnv({ DATABASE_URL: "postgres://pooled", POSTGRES_URL: "postgres://x" }).scriptDatabaseUrl(), "postgres://pooled");
    assert.equal(createServerEnv({ POSTGRES_URL: "postgres://integration-pooled" }).scriptDatabaseUrl(), "postgres://integration-pooled");
  });

  it("reads a root certificate pasted on one line with \\n for its line breaks", () => {
    const env = createServerEnv({ DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----" });
    assert.equal(env.databaseCaCertificate(), "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----");
  });

  it("says when email alerts are half set up, naming what's missing", () => {
    assert.deepEqual(createServerEnv({ RESEND_API_KEY: "re_x", NOTIFY_FROM_EMAIL: "Romaic Guesthouse <b@example.com>" }).resend(), {
      status: "configured",
      apiKey: "re_x",
      from: "Romaic Guesthouse <b@example.com>",
    });
    assert.deepEqual(createServerEnv({ RESEND_API_KEY: "re_x" }).resend(), { status: "partial", missing: "NOTIFY_FROM_EMAIL" });
    assert.deepEqual(createServerEnv({ NOTIFY_FROM_EMAIL: "b@example.com" }).resend(), { status: "partial", missing: "RESEND_API_KEY" });
  });

  it("requires VISITOR_KEY_SECRET on Vercel, the first time it's needed", () => {
    const env = createServerEnv({ VERCEL: "1" });
    assert.equal(env.databaseUrl(), null, "other getters still work");
    assert.throws(() => env.visitorKeySecret(), /Set VISITOR_KEY_SECRET/);
  });

  it("refuses a malformed value when it's first read, never at import, naming the variable but not its value", () => {
    const env = createServerEnv({ DATABASE_POOL_MAX: "lots-of-them", NEXT_PUBLIC_SITE_URL: "not-an-address" });
    const problem = (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_POOL_MAX \(expected a whole number from 1 to 50\)/);
      assert.match(error.message, /NEXT_PUBLIC_SITE_URL \(expected a full address/);
      assert.ok(!error.message.includes("lots-of-them") && !error.message.includes("not-an-address"), "values can be secrets, so they're not repeated");
      return true;
    };
    assert.throws(() => env.databaseUrl(), problem);
    for (const value of ["0", "51", "2.5", "3 connections"]) {
      assert.throws(() => createServerEnv({ DATABASE_POOL_MAX: value }).databasePoolMax(), /DATABASE_POOL_MAX/, value);
    }
  });

  it("reads its source once, on first use", () => {
    const source: Record<string, string | undefined> = { CRON_SECRET: "first" };
    const env = createServerEnv(source);
    assert.equal(env.cronSecret(), "first");
    source.CRON_SECRET = "changed later";
    assert.equal(env.cronSecret(), "first");
  });
});
