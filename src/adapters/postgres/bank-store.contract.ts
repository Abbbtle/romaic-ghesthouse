import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bankStoreContract, testBankAccount, testLine } from "@/lib/bookkeeping/testing/store-contract";
import { createPostgresBankStore } from "./bank-store";
import { postgresBookkeepingFixtures } from "./expense-store.contract";
import type { TestDatabases } from "./testing/test-databases";
import { whenConcurrent } from "./testing/test-databases";

const importOf = (bankAccountId: string, id: string) => ({ id, bankAccountId, fileName: "november.csv", importedAt: new Date("2026-11-12T08:00:00Z"), importedBy: null, rowCount: 0, skippedCount: 0 });

/**
 * The Postgres bank store: the core's contract, then what only the database
 * can show (accounts, imports and lines can't be deleted, a line can only be
 * matched, an account's number is only ever kept sealed, and two imports of
 * the same statement at once keep each line once). Run on PGlite by
 * ./bank-store.test.ts and on a real server by ./bank-store.pg.test.ts.
 */
export function describeBankStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: bank`, () => {
    for (const { name, run } of bankStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run(createPostgresBankStore(db), postgresBookkeepingFixtures(db));
      });
    }

    it("keeps the account number sealed, and refuses deleting accounts, imports or lines, or changing a line", async () => {
      const db = databases.migrated();
      const store = createPostgresBankStore(db);
      const account = testBankAccount();
      await store.addAccount(account, "v1.sealed-value");
      const importId = "00000000-0000-4000-8000-0000000c0001";
      const line = testLine(account.id, importId, { dedupeHash: "only" });
      await store.recordImport({ ...importOf(account.id, importId), rowCount: 1 }, [line]);
      const stored = await db.get<Record<string, unknown>>("select * from app.bank_accounts where id = :id", { id: account.id });
      assert.equal(stored?.account_number_sealed, "v1.sealed-value");
      assert.equal(stored?.account_number_last4, "6789");
      await assert.rejects(db.run("delete from app.bank_accounts where id = :id", { id: account.id }));
      await assert.rejects(db.run("delete from app.bank_imports where id = :id", { id: importId }));
      await assert.rejects(db.run("delete from app.bank_lines where id = :id", { id: line.id }));
      await assert.rejects(db.run("update app.bank_lines set amount_cents = 1 where id = :id", { id: line.id }));
      await assert.rejects(db.run("update app.bank_lines set line_date = '2026-01-01' where id = :id", { id: line.id }));
      await assert.rejects(db.run("update app.bank_imports set added_count = 0 where id = :id", { id: importId }));
      await assert.rejects(db.run("update app.bank_accounts set ledger_code = '1001' where id = :id", { id: account.id }));
      await assert.rejects(db.run("update app.bank_accounts set account_number_last4 = '0000' where id = :id", { id: account.id }));
      assert.equal((await store.line(line.id))?.amountCents, line.amountCents);
    });

    it("refuses a bank account on an account that isn't a bank's, and a line of nothing", async () => {
      const db = databases.migrated();
      const store = createPostgresBankStore(db);
      await assert.rejects(store.addAccount(testBankAccount({ ledgerCode: "1010" }), "sealed"));
      await assert.rejects(store.addAccount(testBankAccount({ ledgerCode: "3000" }), "sealed"));
      await assert.rejects(store.addAccount(testBankAccount({ ledgerCode: "1009" }), "sealed"), "not in the chart yet");
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const importId = "00000000-0000-4000-8000-0000000c0002";
      await assert.rejects(store.recordImport({ ...importOf(account.id, importId), rowCount: 1 }, [testLine(account.id, importId, { amountCents: 0 })]));
      assert.deepEqual(await store.imports(account.id, 5), [], "nothing kept of a refused import");
    });

    it("keeps each line once when the same statement is imported twice at once", whenConcurrent(databases), async () => {
      const db = databases.migrated();
      const store = createPostgresBankStore(db);
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const lines = (importId: string) => [testLine(account.id, importId, { dedupeHash: "a" }), testLine(account.id, importId, { dedupeHash: "b", rowNumber: 3 })];
      const [first, second] = ["00000000-0000-4000-8000-0000000c0003", "00000000-0000-4000-8000-0000000c0004"];
      const outcomes = await Promise.all([store.recordImport({ ...importOf(account.id, first), rowCount: 2 }, lines(first)), store.recordImport({ ...importOf(account.id, second), rowCount: 2 }, lines(second))]);
      assert.deepEqual(outcomes.map((outcome) => outcome.added).sort(), [0, 2]);
      assert.equal((await store.lineCounts(account.id)).lines, 2);
    });
  });
}
