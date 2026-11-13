import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ledgerStoreContract, testJournal, testLine } from "@/lib/ledger/testing/store-contract";
import { createPostgresLedgerStore } from "./ledger-store";
import type { TestDatabases } from "./testing/test-databases";

/**
 * The Postgres ledger store: the core's contract, then what only the
 * database can show (a posted journal can't be changed or deleted, and an
 * unbalanced journal can't get in even past the store). Run on PGlite by
 * ./ledger-store.test.ts and on a real server by ./ledger-store.pg.test.ts.
 */
export function describeLedgerStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: ledger`, () => {
    for (const { name, run } of ledgerStoreContract) {
      it(name, async () => run(createPostgresLedgerStore(databases.migrated())));
    }

    it("refuses to change or delete a posted journal or its lines", async () => {
      const db = databases.migrated();
      const store = createPostgresLedgerStore(db);
      const journal = testJournal();
      await store.post(journal);
      await assert.rejects(db.run("update app.journals set memo = 'changed' where id = :id", { id: journal.id }));
      await assert.rejects(db.run("delete from app.journals where id = :id", { id: journal.id }));
      await assert.rejects(db.run("update app.journal_lines set debit_cents = 1 where journal_id = :id", { id: journal.id }));
      await assert.rejects(db.run("delete from app.journal_lines where journal_id = :id", { id: journal.id }));
      assert.equal((await store.journal(journal.id))?.memo, journal.memo);
    });

    it("refuses lines added later to a posted journal, even balanced ones", async () => {
      const db = databases.migrated();
      const store = createPostgresLedgerStore(db);
      const journal = testJournal();
      await store.post(journal);
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.run("insert into app.journal_lines (journal_id, line_no, account_code, debit_cents) values (:id, 5, '1000', 100)", { id: journal.id });
          await tx.run("insert into app.journal_lines (journal_id, line_no, account_code, credit_cents) values (:id, 6, '3000', 100)", { id: journal.id });
        }),
      );
      assert.equal((await store.journal(journal.id))?.lines.length, 2);
    });

    it("refuses an unbalanced or one-line journal written straight to the tables", async () => {
      const db = databases.migrated();
      const id = "00000000-0000-4000-8000-0000000fffff";
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.run("insert into app.journals (id, entry_date, period, memo, posted_at) values (:id, '2026-11-12', '2026-11', 'Lopsided', now())", { id });
          await tx.run("insert into app.journal_lines (journal_id, line_no, account_code, debit_cents) values (:id, 0, '1000', 100)", { id });
        }),
      );
      assert.equal(await createPostgresLedgerStore(db).journal(id), null);
    });

    it("refuses a journal whose period doesn't match its date, or a line on both sides", async () => {
      const db = databases.migrated();
      const store = createPostgresLedgerStore(db);
      await assert.rejects(store.post({ ...testJournal(), period: "2026-10" }));
      await assert.rejects(store.post(testJournal({ lines: [{ ...testLine("1000", "debit", 100), creditCents: 100 }, testLine("3000", "credit", 100), testLine("3000", "credit", 100)] })));
    });
  });
}
