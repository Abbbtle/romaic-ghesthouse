import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { migrations } from "@/adapters/postgres/migrations/registry";
import { createServerEnv } from "./env";
import { emailSenderFor, failureReason, openAppDatabase, processSingleton, safeErrorSummary } from "./infrastructure";

describe("openAppDatabase", () => {
  it("refuses to open the database while `next build` runs, so nothing is frozen into a page", () => {
    assert.throws(() => openAppDatabase(createServerEnv({ NEXT_PHASE: "phase-production-build" })), /during `next build`/);
  });

  it("refuses PGlite on Vercel, whose functions have no disk", () => {
    assert.throws(() => openAppDatabase(createServerEnv({ VERCEL: "1" })), /Set DATABASE_URL/);
  });

  describe("without a database URL", () => {
    const directories: string[] = [];
    after(async () => {
      await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
    });

    it("keeps the database in PGLITE_DATA_DIR with every migration applied, and finds it there again", async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "romaic-pglite-"));
      directories.push(directory);
      const serverEnv = createServerEnv({ PGLITE_DATA_DIR: path.join(directory, "pglite") });
      const applied = "select count(*) as count from app.schema_migrations";

      const first = openAppDatabase(serverEnv);
      assert.deepEqual(await first.get(applied), { count: migrations.length });
      await first.run("insert into app.rate_limits values ('test', 'key', 0, 1)");
      await first.close();

      const again = openAppDatabase(serverEnv);
      assert.deepEqual(await again.get("select scope from app.rate_limits"), { scope: "test" });
      assert.deepEqual(await again.get(applied), { count: migrations.length }, "nothing applied twice");
      await again.close();
    });
  });
});

describe("emailSenderFor", () => {
  it("prints email in development, sends it with Resend once configured, and sends nothing in production without Resend", () => {
    assert.ok(emailSenderFor(createServerEnv({})), "the terminal in development");
    assert.ok(emailSenderFor(createServerEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_x", NOTIFY_FROM_EMAIL: "Romaic Guesthouse <b@example.com>" })));
    assert.equal(emailSenderFor(createServerEnv({ NODE_ENV: "production" })), null);
  });
});

describe("processSingleton", () => {
  it("makes something once per process, and tries again next time if making it failed", () => {
    let made = 0;
    const name = `test-${Math.random()}`;
    assert.throws(() =>
      processSingleton(name, () => {
        throw new Error("not yet");
      }),
    );
    const first = processSingleton(name, () => ({ made: ++made }));
    assert.equal(processSingleton(name, () => ({ made: ++made })), first);
    assert.equal(made, 1);
  });
});

describe("failureReason", () => {
  it("says why in one line: the message, each one when several failed together, or the code", () => {
    assert.equal(failureReason(new Error("password authentication failed for user \"postgres\"")), 'password authentication failed for user "postgres"');
    const refused = (address: string) => Object.assign(new Error(`connect ECONNREFUSED ${address}`), { code: "ECONNREFUSED" });
    assert.equal(failureReason(new AggregateError([refused("::1:5432"), refused("127.0.0.1:5432")], "")), "connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432");
    assert.equal(failureReason(Object.assign(new Error(""), { code: "ETIMEDOUT" })), "ETIMEDOUT");
    assert.equal(failureReason("stopped"), "stopped");
  });
});

describe("safeErrorSummary", () => {
  it("keeps only the codes and names of a database error, whose message and detail can quote personal data", () => {
    const error = Object.assign(new Error('duplicate key value violates unique constraint "accounts_email_unique"'), {
      code: "23505",
      constraint: "accounts_email_unique",
      table: "accounts",
      detail: "Key (email)=(someone@example.com) already exists.",
      routine: "_bt_check_unique",
    });
    assert.deepEqual(safeErrorSummary(error), { name: "Error", code: "23505", constraint: "accounts_email_unique", table: "accounts", routine: "_bt_check_unique" });
  });

  it("keeps an ordinary error's message and stack, and says what anything else was", () => {
    const summary = safeErrorSummary(new TypeError("undefined is not a function"));
    assert.equal(summary.name, "TypeError");
    assert.equal(summary.message, "undefined is not a function");
    assert.match(summary.stack ?? "", /TypeError/);
    assert.deepEqual(safeErrorSummary("someone@example.com"), { error: "string" });
    assert.deepEqual(safeErrorSummary(null), { error: "object" });
  });
});
