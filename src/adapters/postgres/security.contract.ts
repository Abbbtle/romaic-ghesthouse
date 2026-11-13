import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedClock } from "@/lib/kernel/ports";
import { checkSigningKey, createPostgresAuditStore, entryHash, genesisHash, signedEntryHash, type AuditChainKey } from "./audit-store";
import type { Database } from "./database";
import { migrate } from "./migrate";
import { migrations } from "./migrations/registry";
import type { TestDatabases } from "./testing/test-databases";

/** Audit chain keys for the tests: the site's (k1), the one rotated in after it (k2), and one that only shares k1's id. */
const k1: AuditChainKey = { id: "k1", key: Buffer.alloc(32, 1) };
const k2: AuditChainKey = { id: "k2", key: Buffer.alloc(32, 2) };
const notK1: AuditChainKey = { id: "k1", key: Buffer.alloc(32, 9) };

let lastId = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++lastId).padStart(12, "0")}`;

type HashedFields = Parameters<typeof entryHash>[1];
const hashedColumns = "id, at, actor_id, actor_role, actor_name, category, action, target_type, target_id, subject_role, summary, details, ip_hash";

/** An entry as the log hashed them before entries were keyed. */
async function appendUnkeyed(db: Database, summary: string): Promise<void> {
  const prevHash = (await db.get<{ row_hash: string }>("select row_hash from app.audit_log order by seq desc limit 1"))?.row_hash ?? genesisHash;
  const fields: HashedFields = {
    id: nextId(),
    at: new Date("2026-11-01T08:00:00.000Z"),
    actor_id: null,
    actor_role: null,
    actor_name: "",
    category: "content",
    action: "test",
    target_type: null,
    target_id: null,
    subject_role: null,
    summary,
    details: {},
    ip_hash: null,
  };
  await db.run(
    "insert into app.audit_log (id, at, category, action, summary, prev_hash, row_hash) values (:id, :at, 'content', 'test', :summary, :prevHash, :rowHash)",
    { id: fields.id, at: fields.at, summary, prevHash, rowHash: entryHash(prevHash, fields) },
  );
}

/**
 * What someone with owner access to the database does to rewrite the log:
 * the append-only trigger off, one entry's summary changed, the chain from it
 * on recomputed with `rehash` (given each entry's stored row_hash), and the
 * trigger back on.
 */
async function rewriteFrom(db: Database, change: { seq: number; summary: string }, rehash: (prevHash: string, fields: HashedFields, storedHash: string) => string): Promise<void> {
  const before = await db.get<{ row_hash: string }>("select row_hash from app.audit_log where seq < :seq order by seq desc limit 1", { seq: change.seq });
  const rows = await db.all<HashedFields & { seq: string | number; row_hash: string }>(
    `select seq, row_hash, ${hashedColumns} from app.audit_log where seq >= :seq order by seq`,
    { seq: change.seq },
  );
  await db.transaction(async (tx) => {
    await tx.run("alter table app.audit_log disable trigger append_only_rows");
    let prevHash = before?.row_hash ?? genesisHash;
    for (const { seq, row_hash: storedHash, ...fields } of rows) {
      const summary = Number(seq) === change.seq ? change.summary : fields.summary;
      const rowHash = rehash(prevHash, { ...fields, summary }, storedHash);
      await tx.run("update app.audit_log set summary = :summary, prev_hash = :prevHash, row_hash = :rowHash where seq = :seq", { summary, prevHash, rowHash, seq: Number(seq) });
      prevHash = rowHash;
    }
    await tx.run("alter table app.audit_log enable trigger append_only_rows");
  });
}

/**
 * What the database itself enforces, whatever the app does (threat model
 * T08, T13, T15, T21): every app table locked away from Supabase's API
 * roles, the audit log append-only and hash-chained, and the runtime role
 * granted only what it needs.
 */
export function describeDatabaseSecurityContract(databases: TestDatabases): void {
  const { label } = databases;
  const audit = (db: ReturnType<TestDatabases["migrated"]>, keys: readonly AuditChainKey[] = [k1]) =>
    createPostgresAuditStore(db, { clock: fixedClock("2026-11-12T08:00:00.000Z"), ids: { newId: nextId }, chainKeys: () => keys });

  describe(`${label}: database security`, () => {
    it("keeps every app table out of reach of Supabase's API roles", async () => {
      const driver = databases.empty();
      await driver.runScript(`
        do $$
        begin
          if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        exception when duplicate_object then null;
        end $$;
        alter default privileges grant all on tables to anon, authenticated;
      `);
      await migrate(driver, migrations);
      const { rows } = await driver.query<{ table_name: string; reachable: boolean }>(
        `select c.relname as table_name,
           has_table_privilege('anon', c.oid, 'select, insert, update, delete') or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete') as reachable
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app' and c.relkind in ('r', 'p')`,
        [],
      );
      assert.ok(rows.length >= 10, "every Phase 1 table is checked");
      assert.deepEqual(
        rows.filter((row) => row.reachable).map((row) => row.table_name),
        [],
      );
    });

    it("refuses to change, delete or truncate audit entries", async () => {
      const db = databases.migrated();
      await audit(db).record({ actor: null, category: "security", action: "test", summary: "A test entry" });
      await assert.rejects(db.run("update app.audit_log set summary = 'changed'"), /append-only/);
      await assert.rejects(db.run("delete from app.audit_log"), /append-only/);
      await assert.rejects(db.run("truncate app.audit_log"), /append-only/);
      assert.equal((await db.get<{ count: number }>("select count(*)::int as count from app.audit_log"))?.count, 1);
    });

    it("chains audit entries, and spots an entry changed by someone with owner access to the database", async () => {
      const db = databases.migrated();
      const store = audit(db);
      for (const summary of ["first", "second", "third"]) await store.record({ actor: null, category: "content", action: "test", summary, details: { nested: { b: 1, a: 2 } } });
      assert.deepEqual(await store.verifyChain(), { status: "intact", entries: 3 });
      await db.transaction(async (tx) => {
        await tx.run("alter table app.audit_log disable trigger append_only_rows");
        await tx.run("update app.audit_log set summary = 'quietly changed' where summary = 'second'");
        await tx.run("alter table app.audit_log enable trigger append_only_rows");
      });
      const check = await store.verifyChain();
      assert.equal(check.status, "broken");
    });

    it("hashes an entry's text as the database stores it, so U+0000 or a lone surrogate typed into a name doesn't break the chain", async () => {
      const db = databases.migrated();
      const store = audit(db);
      await store.record({
        actor: { id: "00000000-0000-4000-8000-0000000000aa", role: "sales", name: "Sales\u0000 person" },
        category: "guests",
        action: "guest.updated",
        target: { type: "guest", id: "guest\u0000-1" },
        summary: "Renamed a guest to Thabo\u0000 \ud800M.",
        details: { name: "Thabo\u0000", "key\u0000": "\udc00", when: new Date("2026-11-12T08:00:00.000Z"), dropped: undefined },
      });
      await store.record({ actor: null, category: "content", action: "test", summary: "after it" });
      assert.deepEqual(await store.verifyChain(), { status: "intact", entries: 2 });
      const stored = await db.get<{ actor_name: string; summary: string; details: Record<string, unknown> }>("select actor_name, summary, details from app.audit_log order by seq limit 1");
      assert.deepEqual(stored, {
        actor_name: "Sales� person",
        summary: "Renamed a guest to Thabo� �M.",
        details: { name: "Thabo�", "key�": "�", when: "2026-11-12T08:00:00.000Z" },
      });
    });

    it("signs entries with a key the database doesn't hold, so a chain recomputed after an edit doesn't check out (threat model T15)", async () => {
      const db = databases.migrated();
      const store = audit(db);
      for (const summary of ["first", "second", "third"]) await store.record({ actor: null, category: "money", action: "test", summary });
      const hashes = await db.all<{ row_hash: string }>("select row_hash from app.audit_log order by seq");
      assert.ok(hashes.every(({ row_hash }) => /^hmac1\.k1\.[0-9a-f]{64}$/.test(row_hash)), "each entry names the key that signed it");

      // Recomputed with the public SHA-256 the log used before entries were keyed.
      await rewriteFrom(db, { seq: 2, summary: "quietly changed" }, (prevHash, fields) => entryHash(prevHash, fields));
      assert.deepEqual(await store.verifyChain(), { status: "broken", atSeq: 2 });
    });

    it("spots a chain re-signed with a key that isn't the site's, even one with the same id", async () => {
      const db = databases.migrated();
      const store = audit(db);
      for (const summary of ["first", "second", "third"]) await store.record({ actor: null, category: "money", action: "test", summary });
      await rewriteFrom(db, { seq: 2, summary: "quietly changed" }, (prevHash, fields) => signedEntryHash(notK1, prevHash, fields));
      assert.deepEqual(await store.verifyChain(), { status: "broken", atSeq: 2 });
    });

    it("checks entries signed with an older key while it's still listed, and stops trusting them once it's dropped", async () => {
      const db = databases.migrated();
      await audit(db, [k1]).record({ actor: null, category: "content", action: "test", summary: "before the rotation" });
      await audit(db, [k2, k1]).record({ actor: null, category: "content", action: "test", summary: "after it" });
      assert.deepEqual(
        (await db.all<{ row_hash: string }>("select row_hash from app.audit_log order by seq")).map(({ row_hash }) => row_hash.split(".")[1]),
        ["k1", "k2"],
        "new entries use the first key",
      );
      assert.deepEqual(await audit(db, [k2, k1]).verifyChain(), { status: "intact", entries: 2 });
      assert.deepEqual(await audit(db, [k2]).verifyChain(), { status: "broken", atSeq: 1 });
      assert.deepEqual(await audit(db, [k2, notK1]).verifyChain(), { status: "broken", atSeq: 1 });
    });

    it("accepts entries hashed before entries were keyed only at the start of the chain, vouched for by a keyed entry after them", async () => {
      const db = databases.migrated();
      const store = audit(db);
      await appendUnkeyed(db, "older");
      await appendUnkeyed(db, "old");
      assert.deepEqual(await store.verifyChain(), { status: "broken", atSeq: 2 }, "on their own they prove nothing: anyone can recompute them");
      await store.record({ actor: null, category: "content", action: "test", summary: "keyed" });
      assert.deepEqual(await store.verifyChain(), { status: "intact", entries: 3 });

      // Rewriting an older entry means recomputing every hash after it, and the keyed entry's can't be.
      await rewriteFrom(db, { seq: 1, summary: "quietly changed" }, (prevHash, fields, storedHash) => (storedHash.startsWith("hmac1.") ? storedHash : entryHash(prevHash, fields)));
      assert.deepEqual(await store.verifyChain(), { status: "broken", atSeq: 3 });

      const later = databases.migrated();
      await audit(later).record({ actor: null, category: "content", action: "test", summary: "keyed" });
      await appendUnkeyed(later, "slipped in after it");
      assert.deepEqual(await audit(later).verifyChain(), { status: "broken", atSeq: 2 });
    });

    it("tells a script whether its first key signed the newest keyed entry, before it writes one", async () => {
      const db = databases.migrated();
      assert.deepEqual(await checkSigningKey(db, [k1]), { status: "no-signed-entries" });
      await appendUnkeyed(db, "old");
      assert.deepEqual(await checkSigningKey(db, [k1]), { status: "no-signed-entries" });
      await audit(db, [k1]).record({ actor: null, category: "content", action: "test", summary: "keyed" });
      assert.deepEqual(await checkSigningKey(db, [k1]), { status: "matches" });
      assert.deepEqual(await checkSigningKey(db, [k1, k2]), { status: "matches" });
      assert.deepEqual(await checkSigningKey(db, [k2, k1]), { status: "other-key", atSeq: 2 }, "it would sign with k2, which the site may not know");
      assert.deepEqual(await checkSigningKey(db, [notK1]), { status: "other-key", atSeq: 2 });
    });

    it("lists entries newest first, only within the scope asked for, in the query itself", async () => {
      const db = databases.migrated();
      const store = audit(db);
      await store.record({ actor: null, category: "money", action: "test", summary: "money" });
      await store.record({ actor: null, category: "content", action: "test", summary: "content" });
      await store.record({ actor: null, category: "team", action: "test", subjectRole: "staff", summary: "staff account" });
      await store.record({ actor: null, category: "team", action: "test", subjectRole: "sales", summary: "sales account" });
      await store.record({ actor: null, category: "content", action: "test", summary: "newer content" });
      const adminScope = { categories: ["content", "team"] as const, subjectRoles: ["staff"] as const };
      assert.deepEqual(
        (await store.list({ scope: adminScope, limit: 10 })).map((entry) => entry.summary),
        ["newer content", "staff account", "content"],
      );
      // A limit counts only entries in scope, and the next page starts below the last one shown.
      const firstPage = await store.list({ scope: adminScope, limit: 2 });
      assert.deepEqual(firstPage.map((entry) => entry.summary), ["newer content", "staff account"]);
      assert.deepEqual(
        (await store.list({ scope: adminScope, limit: 2, beforeSeq: firstPage.at(-1)?.seq })).map((entry) => entry.summary),
        ["content"],
      );
      assert.deepEqual(await store.list({ scope: { categories: [], subjectRoles: [] }, limit: 10 }), []);
    });

    it("keeps an entry's subject role in its hash, so changing who may read it breaks the chain", async () => {
      const db = databases.migrated();
      const store = audit(db);
      await store.record({ actor: null, category: "team", action: "test", subjectRole: "owner", summary: "about the owner" });
      await db.transaction(async (tx) => {
        await tx.run("alter table app.audit_log disable trigger append_only_rows");
        await tx.run("update app.audit_log set subject_role = 'staff'");
        await tx.run("alter table app.audit_log enable trigger append_only_rows");
      });
      assert.equal((await store.verifyChain()).status, "broken");
    });

    it("grants the runtime role data access but no edits to the audit log, through row level security", async () => {
      const driver = databases.empty();
      await driver.runScript(`
        do $$
        begin
          if not exists (select from pg_roles where rolname = 'romaic_app') then create role romaic_app nologin; end if;
        exception when duplicate_object then null;
        end $$;
      `);
      await migrate(driver, migrations);
      const { rows } = await driver.query<Record<string, boolean>>(
        `select has_table_privilege('romaic_app', 'app.accounts', 'select, insert, update, delete') as accounts_rw,
           has_table_privilege('romaic_app', 'app.audit_log', 'select') as audit_select,
           has_table_privilege('romaic_app', 'app.audit_log', 'insert') as audit_insert,
           has_table_privilege('romaic_app', 'app.audit_log', 'update') as audit_update,
           has_table_privilege('romaic_app', 'app.audit_log', 'delete') as audit_delete,
           has_table_privilege('romaic_app', 'app.audit_log', 'truncate') as audit_truncate,
           exists (select from pg_policies where schemaname = 'app' and tablename = 'accounts' and policyname = 'runtime_access') as accounts_policy`,
        [],
      );
      assert.deepEqual(rows, [
        { accounts_rw: true, audit_select: true, audit_insert: true, audit_update: false, audit_delete: false, audit_truncate: false, accounts_policy: true },
      ]);
    });
  });
}


