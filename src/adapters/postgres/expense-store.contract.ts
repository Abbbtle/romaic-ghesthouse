import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expenseStoreContract, testExpense, testSupplier, type BookkeepingFixtures } from "@/lib/bookkeeping/testing/store-contract";
import { reversedLines } from "@/lib/ledger/journals";
import { testJournal, testLine } from "@/lib/ledger/testing/store-contract";
import type { Database } from "./database";
import { createPostgresExpenseStore } from "./expense-store";
import { createPostgresLedgerStore } from "./ledger-store";
import type { TestDatabases } from "./testing/test-databases";

let fileCounter = 0;

/** What the bookkeeping contracts need already in a database: journals to point at, and private files. */
export function postgresBookkeepingFixtures(db: Database): BookkeepingFixtures {
  const ledger = createPostgresLedgerStore(db);
  return {
    async postJournal(cents, bankCode = "1000") {
      const amount = Math.abs(cents);
      const journal = testJournal({
        date: "2026-11-05",
        memo: "Test",
        lines: cents > 0 ? [testLine(bankCode, "debit", amount), testLine("3000", "credit", amount)] : [testLine("3000", "debit", amount), testLine(bankCode, "credit", amount)],
      });
      assert.deepEqual(await ledger.post(journal), { status: "posted" });
      return journal.id;
    },
    async reverseJournal(journalId) {
      const original = await ledger.journal(journalId);
      assert.ok(original);
      assert.deepEqual(await ledger.post(testJournal({ date: original.date, memo: "Reversal", reversalOf: original.id, lines: reversedLines(original.lines) })), { status: "posted" });
    },
    async storeFile() {
      const id = `00000000-0000-4000-8000-00000f${String((fileCounter += 1)).padStart(6, "0")}`;
      await db.run(
        `insert into app.private_files (id, purpose, file_name, content_type, byte_size, sha256, bytes, created_at, created_by)
         values (:id, 'receipt', 'receipt.pdf', 'application/pdf', 5, encode(sha256('%PDF-'::bytea), 'hex'), '%PDF-'::bytea, now(), null)`,
        { id },
      );
      return id;
    },
    async addBankLedgerAccount(code) {
      assert.equal(await ledger.addAccount({ code, name: "Savings", kind: "asset", system: true, active: true }), "added");
      return code;
    },
  };
}

/**
 * The Postgres expense store: the core's contract, then what only the
 * database can show (expenses and suppliers can't be deleted, what an
 * expense says can't be rewritten, and it carries no VAT). Run on PGlite by
 * ./expense-store.test.ts and on a real server by ./expense-store.pg.test.ts.
 */
export function describeExpenseStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: expenses`, () => {
    for (const { name, run } of expenseStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run(createPostgresExpenseStore(db), postgresBookkeepingFixtures(db));
      });
    }

    it("refuses to delete an expense or supplier, or to change what an expense says", async () => {
      const db = databases.migrated();
      const store = createPostgresExpenseStore(db);
      const supplier = testSupplier();
      await store.addSupplier(supplier);
      const expense = testExpense(supplier.id);
      await store.addExpense(expense);
      await assert.rejects(db.run("delete from app.expenses where id = :id", { id: expense.id }));
      await assert.rejects(db.run("delete from app.suppliers where id = :id", { id: supplier.id }));
      await assert.rejects(db.run("update app.expenses set amount_cents = 1 where id = :id", { id: expense.id }));
      await assert.rejects(db.run("update app.expenses set account_code = '5200' where id = :id", { id: expense.id }));
      await assert.rejects(db.run("update app.expenses set vat_cents = 100 where id = :id", { id: expense.id }));
      await store.voidExpense(expense.id, new Date(), supplier.createdBy!, "Entered twice");
      await assert.rejects(db.run("update app.expenses set void_reason = 'Something else' where id = :id", { id: expense.id }));
      await assert.rejects(db.run("update app.expenses set voided_at = null, void_reason = null, voided_by = null where id = :id", { id: expense.id }));
      assert.equal((await store.expense(expense.id))?.amountCents, expense.amountCents);
    });

    it("refuses an expense whose money came from the wrong kind of account, or that carries VAT", async () => {
      const db = databases.migrated();
      const store = createPostgresExpenseStore(db);
      const supplier = testSupplier();
      await store.addSupplier(supplier);
      await assert.rejects(store.addExpense(testExpense(supplier.id, { paidBy: "cash", paidFrom: "1000" })));
      await assert.rejects(store.addExpense(testExpense(supplier.id, { paidBy: "bank", paidFrom: "1010" })));
      await assert.rejects(store.addExpense(testExpense(supplier.id, { paidBy: "owner", paidFrom: "3100" })));
      await assert.rejects(store.addExpense(testExpense(supplier.id, { accountCode: "4000" })));
      await assert.rejects(store.addExpense(testExpense("00000000-0000-4000-8000-00000000ffff")));
      await assert.rejects(
        db.run(
          `insert into app.expenses (id, expense_date, supplier_id, account_code, amount_cents, description, paid_by, paid_from, created_at, vat_cents)
           values ('00000000-0000-4000-8000-00000000fff1', '2026-11-10', :supplierId, '5500', 1000, 'With VAT', 'cash', '1010', now(), 150)`,
          { supplierId: supplier.id },
        ),
      );
      assert.deepEqual(await store.expenses({ limit: 10 }), []);
    });
  });
}
