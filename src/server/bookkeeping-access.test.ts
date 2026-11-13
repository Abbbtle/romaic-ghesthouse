import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, isFinancePermission, NotAllowedError } from "@/lib/accounts/access";
import { bookkeepingHarness } from "@/lib/bookkeeping/testing/harness";
import type { Actor, Role } from "@/lib/kernel/actor";
import { privateFilePermissions } from "@/lib/media/private-files";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

const statement = "Date,Description,Amount,Balance\n2026-11-04,Monthly fee,-35.00,965.00\n";
const columns = { separator: ",", skipRows: "0", hasHeader: "on", dateColumn: "0", dateFormat: "yyyy-mm-dd", descriptionColumn: "1", amountKind: "single", amountColumn: "2", balanceColumn: "3", decimal: "." };
const expense = { date: "2026-11-10", supplierId: "new", supplierName: "Welkom Hardware", accountCode: "5500", amount: "450", description: "Tap washers", paidBy: "cash" };

describe("bookkeeping with the real permission matrix (roles.md)", () => {
  it("keeps expenses, bank accounts and their receipts to finance permissions only the owner holds", () => {
    for (const permission of ["expenses:manage", "bank:manage"] as const) {
      assert.equal(isFinancePermission(permission), true, permission);
      assert.deepEqual((["owner", "admin", "sales", "staff"] as const).filter((role) => can({ role }, permission)), ["owner"], permission);
    }
    assert.equal(privateFilePermissions.receipt, "expenses:manage");
  });

  it("lets the owner record and void expenses, add a bank account, import a statement and reconcile it", async () => {
    const harness = bookkeepingHarness({ access: { can, assertCan } });
    const owner = actor("owner");
    const recorded = await harness.expenses.record(owner, expense);
    assert.ok(recorded.ok);
    assert.deepEqual(await harness.expenses.voidExpense(owner, recorded.id, { reason: "Entered twice" }), { ok: true, postProblem: null });
    const account = await harness.bank.addAccount(owner, { name: "Business cheque", bankName: "A bank", accountNumber: "6212345678" });
    assert.ok(account.ok);
    const imported = await harness.bank.importStatement(owner, account.id, { fileName: "november.csv", text: statement, mapping: columns });
    assert.deepEqual(imported, { ok: true, added: 1, duplicates: 0, skipped: 0 });
    const [line] = await harness.bankStore.lines(account.id, { status: "all", limit: 5 });
    assert.equal((await harness.bank.makeJournal(owner, line!.id, { kind: "bank-charges" })).ok, true);
    assert.deepEqual(await harness.bank.unmatch(owner, line!.id), { ok: true });
  });

  it("refuses admin (Weberu), sales and staff every expenses and bank path", async () => {
    const harness = bookkeepingHarness({ access: { can, assertCan } });
    const owner = actor("owner");
    const recorded = await harness.expenses.record(owner, expense);
    assert.ok(recorded.ok);
    const account = await harness.bank.addAccount(owner, { name: "Business cheque", bankName: "A bank", accountNumber: "6212345678" });
    assert.ok(account.ok);
    await harness.bank.importStatement(owner, account.id, { fileName: "november.csv", text: statement, mapping: columns });
    const [line] = await harness.bankStore.lines(account.id, { status: "all", limit: 5 });
    const journalsBefore = harness.ledgerState.journals.length;
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actor(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["options", () => harness.expenses.options(who)],
        ["list", () => harness.expenses.list(who, { limit: 5 })],
        ["expense", () => harness.expenses.expense(who, recorded.id)],
        ["record", () => harness.expenses.record(who, expense)],
        ["voidExpense", () => harness.expenses.voidExpense(who, recorded.id, { reason: "x" })],
        ["retryPosting", () => harness.expenses.retryPosting(who, recorded.id)],
        ["checkReceiptRoom", () => harness.expenses.checkReceiptRoom(who, recorded.id)],
        ["attachReceipt", () => harness.expenses.attachReceipt(who, recorded.id, "00000000-0000-4000-8000-00000000f001")],
        ["suppliers", () => harness.expenses.suppliers(who)],
        ["addSupplier", () => harness.expenses.addSupplier(who, { name: "x" })],
        ["changeSupplier", () => harness.expenses.changeSupplier(who, "s", { name: "x" })],
        ["accounts", () => harness.bank.accounts(who)],
        ["account", () => harness.bank.account(who, account.id, { status: "all", limit: 5 })],
        ["addAccount", () => harness.bank.addAccount(who, { name: "x", bankName: "y", accountNumber: "1234" })],
        ["importStatement", () => harness.bank.importStatement(who, account.id, { fileName: "x.csv", text: statement, mapping: columns })],
        ["line", () => harness.bank.line(who, line!.id)],
        ["matchJournal", () => harness.bank.matchJournal(who, line!.id, "j")],
        ["makeJournal", () => harness.bank.makeJournal(who, line!.id, { kind: "bank-charges" })],
        ["unmatch", () => harness.bank.unmatch(who, line!.id)],
        ["lineForExpense", () => harness.bank.lineForExpense(who, line!.id)],
      ];
      for (const [name, call] of calls) await assert.rejects(call(), NotAllowedError, `${role}: ${name}`);
    }
    assert.equal(harness.ledgerState.journals.length, journalsBefore, "nothing posted by a refused call");
    assert.equal((await harness.expenseStore.expense(recorded.id))?.voidedAt, null);
    assert.equal((await harness.bankStore.accounts()).length, 1);
  });
});
