import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { movableClock } from "@/lib/accounts/testing/fakes";
import { jsonParam } from "./database";
import { ExclusionViolationError, UniqueViolationError } from "./errors";
import { migrate } from "./migrate";
import { migrations } from "./migrations/registry";
import { longestRateLimitWindowMs } from "@/lib/kernel/rate-limit";
import { createPostgresRateLimiter, deleteEndedRateLimitWindows } from "./rate-limiter";
import { whenConcurrent, type TestDatabases } from "./testing/test-databases";

/**
 * What the Postgres layer promises whichever driver runs it: the same values
 * from every column type, typed constraint errors, one migration however
 * many servers start together, and rate limits every server shares. Run on
 * PGlite by ./postgres.test.ts and on a real server by ./postgres.pg.test.ts.
 */
export function describePostgresContract(databases: TestDatabases): void {
  const { label } = databases;

  describe(`${label}: value types`, () => {
    it("reads every column type the way the stores expect", async () => {
      const db = databases.migrated();
      const row = await db.get<Record<string, unknown>>(
        `select
           date '2026-10-20' as day,
           time '06:30' as at,
           timestamptz '2026-10-20 06:30:00.123+02' as instant,
           timestamp '2026-10-20 06:30:00' as wall,
           9007199254740991::int8 as big,
           (select count(*) from app.schema_migrations) as migrations,
           12.5::numeric as amount,
           '{"a": [1, "x"], "b": null}'::jsonb as data,
           '{"b": 2}'::json as legacy,
           '\\x00ff10'::bytea as bytes,
           array['a', 'b,c', null, 'd"e']::text[] as words,
           array[1, 2]::int4[] as small,
           array[date '2026-10-20', date '2026-10-21'] as days,
           array[timestamptz '2026-10-20 04:30:00+00'] as instants,
           array[1::int8, 2::int8] as bigs,
           'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as id,
           true as yes,
           null::text as nothing`,
      );
      assert.deepEqual(row, {
        day: "2026-10-20",
        at: "06:30:00",
        instant: new Date("2026-10-20T04:30:00.123Z"),
        wall: new Date("2026-10-20T06:30:00.000Z"),
        big: 9007199254740991,
        migrations: migrations.length,
        amount: 12.5,
        data: { a: [1, "x"], b: null },
        legacy: { b: 2 },
        bytes: Uint8Array.from([0x00, 0xff, 0x10]),
        words: ["a", "b,c", null, 'd"e'],
        small: [1, 2],
        days: ["2026-10-20", "2026-10-21"],
        instants: [new Date("2026-10-20T04:30:00.000Z")],
        bigs: [1, 2],
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        yes: true,
        nothing: null,
      });
      // A Node Buffer would pass deepEqual's byte check but not this.
      assert.equal(Object.getPrototypeOf(row?.bytes), Uint8Array.prototype);
    });

    it("runs every session in UTC, inside transactions and out, whatever the server's own zone", async () => {
      const db = databases.migrated();
      const zone = "select current_setting('TimeZone') as zone, (timestamptz '2026-10-20 23:30:00+00')::date as day";
      const expected = { zone: "UTC", day: "2026-10-20" };
      assert.deepEqual(await db.get(zone), expected);
      assert.deepEqual(await db.transaction((tx) => tx.get(zone)), expected);
      // Several statements at once open several pooled connections, each set up the same way.
      assert.deepEqual(await Promise.all([db.get(zone), db.get(zone), db.get(zone)]), [expected, expected, expected]);
    });

    it("reads instants the same whatever the session's time zone", async () => {
      const db = databases.migrated();
      const row = await db.transaction(async (tx) => {
        // UTC+14: a day ahead of UTC for most of the day, so a zone-dependent read would show.
        await tx.run("set local time zone 'Pacific/Kiritimati'");
        return tx.get<{ instant: Date; day: string; johannesburg_day: string }>(
          `select timestamptz '2026-10-20 23:30:00+00' as instant, date '2026-10-20' as day,
             (timestamptz '2026-10-20 23:30:00+00' at time zone 'Africa/Johannesburg')::date as johannesburg_day`,
        );
      });
      assert.deepEqual(row, { instant: new Date("2026-10-20T23:30:00.000Z"), day: "2026-10-20", johannesburg_day: "2026-10-21" });
    });

    it("binds dates, JSON, bytes and arrays, making text storable", async () => {
      const db = databases.migrated();
      await db.run("create table app.binds (at timestamptz, data jsonb, bytes bytea, words text[], numbers int4[], day date, note text)");
      await db.run("insert into app.binds values (:at, :data, :bytes, :words, :numbers, :day, :note)", {
        at: new Date("2026-10-20T04:30:00.500Z"),
        data: jsonParam({ text: "a\u0000b", lone: "\ud800", "key\u0000": 1, when: new Date("2026-10-20T00:00:00Z") }),
        bytes: Uint8Array.from([1, 2, 255]),
        words: ["a", "b\u0000"],
        numbers: [3, 4],
        day: "2026-10-20",
        note: "x\u0000y",
      });
      assert.deepEqual(await db.get("select * from app.binds"), {
        at: new Date("2026-10-20T04:30:00.500Z"),
        data: { text: "a�b", lone: "�", "key�": 1, when: "2026-10-20T00:00:00.000Z" },
        bytes: Uint8Array.from([1, 2, 255]),
        words: ["a", "b�"],
        numbers: [3, 4],
        day: "2026-10-20",
        note: "x�y",
      });
    });
  });

  describe(`${label}: statements and transactions`, () => {
    it("reports a clash on a unique constraint by the constraint's name, without the clashing value", async () => {
      const db = databases.migrated();
      await db.run("create table app.codes (code text constraint codes_code_unique unique)");
      await db.run("insert into app.codes values ('secret@example.com')");
      const error: unknown = await db.run("insert into app.codes values ('secret@example.com')").catch((caught: unknown) => caught);
      assert.ok(error instanceof UniqueViolationError);
      assert.equal(error.constraint, "codes_code_unique");
      assert.equal(error.table, "codes");
      assert.ok(!JSON.stringify(error).includes("secret") && !error.message.includes("secret"), "the value isn't repeated");
    });

    it("reports an overlap caught by an exclusion constraint by the constraint's name", async () => {
      const db = databases.migrated();
      await db.run(
        `create table app.slots (
           starts_at timestamptz not null,
           ends_at timestamptz not null,
           constraint slots_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
         )`,
      );
      const insert = (from: string, to: string) =>
        db.transaction((tx) => tx.run("insert into app.slots values (:from, :to)", { from: new Date(from), to: new Date(to) }));
      await insert("2026-10-20T04:00:00Z", "2026-10-20T05:00:00Z");
      await insert("2026-10-20T05:00:00Z", "2026-10-20T06:00:00Z"); // back to back is fine
      const error: unknown = await insert("2026-10-20T04:30:00Z", "2026-10-20T05:30:00Z").catch((caught: unknown) => caught);
      assert.ok(error instanceof ExclusionViolationError);
      assert.equal(error.constraint, "slots_no_overlap");
    });

    it("refuses statements on the database inside its own transaction, instead of waiting forever", async () => {
      const db = databases.migrated();
      await assert.rejects(
        db.transaction(async () => db.get("select 1")),
        /run statements through its tx/,
      );
      assert.deepEqual(await db.transaction((tx) => tx.get("select 1 as one")), { one: 1 });
    });

    it("rolls a transaction back when its work throws", async () => {
      const db = databases.migrated();
      await db.run("create table app.notes (body text)");
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.run("insert into app.notes values ('kept?')");
          throw new Error("changed my mind");
        }),
        /changed my mind/,
      );
      assert.deepEqual(await db.all("select * from app.notes"), []);
    });
  });

  describe(`${label}: migrations`, () => {
    const appliedIds = async (db: { all<Row>(sql: string): Promise<Row[]> }) =>
      (await db.all<{ id: string }>("select id from app.schema_migrations order by id")).map((row) => row.id);

    it("brings an empty database up to date, and running again changes nothing", async () => {
      const driver = databases.empty();
      assert.deepEqual(await migrate(driver, migrations), migrations.map((migration) => migration.id));
      assert.deepEqual(await migrate(driver, migrations), []);
      const { rows } = await driver.query<{ id: string }>("select id from app.schema_migrations order by id", []);
      assert.deepEqual(
        rows.map((row) => row.id),
        migrations.map((migration) => migration.id),
      );
    });

    it("applies only the migrations added since the last run", async () => {
      const driver = databases.empty();
      await migrate(driver, migrations.slice(0, 1));
      assert.deepEqual(
        await migrate(driver, migrations),
        migrations.slice(1).map((migration) => migration.id),
      );
    });

    it("migrates once when several servers start at the same moment", whenConcurrent(databases), async () => {
      const driver = databases.empty();
      const results = await Promise.all([migrate(driver, migrations), migrate(driver, migrations), migrate(driver, migrations)]);
      assert.deepEqual(
        results.map((applied) => applied.length).sort((a, b) => a - b),
        [0, 0, migrations.length],
      );
    });

    it("leaves the database as it was when a migration fails", async () => {
      const driver = databases.empty();
      const broken = { id: "999-broken", sql: "create table app.half_done (x int); select * from no_such_table;" };
      await assert.rejects(migrate(driver, [...migrations, broken]), /no_such_table/);
      const { rows } = await driver.query<{ present: boolean }>("select to_regclass('app.schema_migrations') is not null as present", []);
      assert.deepEqual(rows, [{ present: false }]);
    });

    it("migrates a database before its first statement", async () => {
      const db = databases.migrated();
      assert.deepEqual(
        await appliedIds(db),
        migrations.map((migration) => migration.id),
      );
    });

    it("puts row level security on every table in schema app", async () => {
      const db = databases.migrated();
      const unprotected = await db.all(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
      );
      assert.deepEqual(unprotected, []);
    });

    it("keeps Supabase's API roles out of schema app", async () => {
      const driver = databases.empty();
      // Stand in for Supabase: its API roles exist, and new objects are granted to them by default.
      await driver.runScript(`
        do $$
        begin
          if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        exception when duplicate_object then null;
        end $$;
        alter default privileges grant all on tables to anon, authenticated;
        alter default privileges grant usage on schemas to anon, authenticated;
      `);
      await migrate(driver, migrations);
      const { rows } = await driver.query<Record<string, boolean>>(
        `select has_schema_privilege('anon', 'app', 'usage') as anon_schema,
           has_schema_privilege('authenticated', 'app', 'usage') as authenticated_schema,
           has_table_privilege('anon', 'app.accounts', 'select') as anon_accounts,
           has_table_privilege('authenticated', 'app.sessions', 'select') as authenticated_sessions`,
        [],
      );
      assert.deepEqual(rows, [{ anon_schema: false, authenticated_schema: false, anon_accounts: false, authenticated_sessions: false }]);
    });
  });

  describe(`${label}: rate limits`, () => {
    it("allows a number of attempts per window", async () => {
      const clock = movableClock();
      const limiter = createPostgresRateLimiter(databases.migrated(), { scope: "test", maxAttempts: 2, windowMs: 1000 }, clock);
      assert.deepEqual([await limiter.tryConsume("a"), await limiter.tryConsume("a"), await limiter.tryConsume("a")], [true, true, false]);
      assert.equal(await limiter.tryConsume("b"), true, "keys are counted separately");
      clock.advance(1000);
      assert.equal(await limiter.tryConsume("a"), true, "a new window starts over");
      await limiter.tryConsume("a");
      await limiter.reset("a");
      assert.equal(await limiter.tryConsume("a"), true, "a reset key starts over");
    });

    it("keeps each scope's counts apart", async () => {
      const clock = movableClock();
      const db = databases.migrated();
      const signIns = createPostgresRateLimiter(db, { scope: "sign-in", maxAttempts: 1, windowMs: 1000 }, clock);
      const requests = createPostgresRateLimiter(db, { scope: "requests", maxAttempts: 1, windowMs: 1000 }, clock);
      assert.equal(await signIns.tryConsume("same-key"), true);
      assert.equal(await requests.tryConsume("same-key"), true);
      assert.equal(await signIns.tryConsume("same-key"), false);
    });

    it("counts every attempt when several arrive at once, as from many servers", async () => {
      const limiter = createPostgresRateLimiter(databases.migrated(), { scope: "test", maxAttempts: 3, windowMs: 60_000 }, movableClock());
      const allowed = await Promise.all(Array.from({ length: 6 }, () => limiter.tryConsume("visitor")));
      assert.equal(allowed.filter(Boolean).length, 3);
    });

    it("keeps only hashes of keys, and forgets windows that have ended", async () => {
      const clock = movableClock();
      const db = databases.migrated();
      const limiter = createPostgresRateLimiter(db, { scope: "test", maxAttempts: 5, windowMs: 1000 }, clock);
      await limiter.tryConsume("ada@example.com");
      clock.advance(1000);
      await limiter.tryConsume("bea@example.com");
      const keys = (await db.all<{ key: string }>("select key from app.rate_limits where scope = 'test'")).map((row) => row.key);
      assert.equal(keys.length, 1, "the ended window is gone");
      assert.ok(!keys[0]?.includes("@"), "and the key isn't the address");
    });

    it("forgets, in the daily clean-up, every window that started a week or more ago, in any scope", async () => {
      const clock = movableClock();
      const db = databases.migrated();
      const limiter = (scope: string, windowMs: number) => createPostgresRateLimiter(db, { scope, maxAttempts: 5, windowMs }, clock);
      await limiter("weekly", longestRateLimitWindowMs).tryConsume("a");
      // A scope nobody counts in any more never starts a new window, so only the clean-up forgets it.
      await limiter("retired", 60 * 60 * 1000).tryConsume("a");
      clock.advance(longestRateLimitWindowMs - 1);
      await limiter("daily", 24 * 60 * 60 * 1000).tryConsume("a");
      assert.equal(await deleteEndedRateLimitWindows(db, clock.now()), 0, "nothing started a week ago yet");
      clock.advance(1);
      assert.equal(await deleteEndedRateLimitWindows(db, clock.now()), 2);
      assert.deepEqual(await db.all("select scope from app.rate_limits"), [{ scope: "daily" }], "the recent window stays");
    });

    it("refuses a limit whose window the clean-up would cut short", () => {
      const db = databases.migrated();
      assert.throws(() => createPostgresRateLimiter(db, { scope: "monthly", maxAttempts: 5, windowMs: 30 * 24 * 60 * 60 * 1000 }, movableClock()), /a week/);
      assert.throws(() => createPostgresRateLimiter(db, { scope: "never", maxAttempts: 5, windowMs: 0 }, movableClock()), /a week/);
    });
  });
}
