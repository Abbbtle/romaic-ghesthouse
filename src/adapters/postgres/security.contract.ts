import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedClock } from "@/lib/kernel/ports";
import { createPostgresAuditStore } from "./audit-store";
import { migrate } from "./migrate";
import { migrations } from "./migrations/registry";
import type { TestDatabases } from "./testing/test-databases";

/**
 * What the database itself enforces, whatever the app does (threat model
 * T08, T13, T15, T21): every app table locked away from Supabase's API
 * roles, the audit log append-only and hash-chained, and the runtime role
 * granted only what it needs.
 */
export function describeDatabaseSecurityContract(databases: TestDatabases): void {
  const { label } = databases;
  const audit = (db: ReturnType<TestDatabases["migrated"]>) =>
    createPostgresAuditStore(db, { clock: fixedClock("2026-11-12T08:00:00.000Z"), ids: { newId: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; })() } });

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


