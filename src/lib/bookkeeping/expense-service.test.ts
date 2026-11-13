import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testExpense } from "./testing/store-contract";
import { bookkeepingHarness, testActor, TestNotAllowedError } from "./testing/harness";

const owner = testActor("owner");

const expense = (fields: Record<string, string> = {}) => ({
  date: "2026-11-10",
  supplierId: "new",
  supplierName: "Welkom Hardware",
  accountCode: "5500",
  amount: "450",
  description: "Tap washers and a shower head",
  paidBy: "cash",
  ...fields,
});

async function recorded(harness: ReturnType<typeof bookkeepingHarness>, fields: Record<string, string> = {}) {
  const result = await harness.expenses.record(owner, expense(fields));
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}

describe("recording expenses", () => {
  it("posts the expense's journal: the account spent against debited, cash on hand credited, the supplier on the line", async () => {
    const harness = bookkeepingHarness();
    const result = await recorded(harness);
    assert.equal(result.postProblem, null);
    const journal = await harness.ledgerStore.journal(result.journalId!);
    assert.deepEqual(journal?.source, { type: "expense", id: result.id, part: "recorded" });
    assert.equal(journal?.date, "2026-11-10");
    assert.equal(journal?.memo, "Welkom Hardware: Tap washers and a shower head");
    const stored = await harness.expenseStore.expense(result.id);
    assert.deepEqual(
      journal?.lines.map((line) => [line.accountCode, line.debitCents, line.creditCents, line.party]),
      [
        ["5500", 45_000, 0, `supplier:${stored?.supplierId}`],
        ["1010", 0, 45_000, null],
      ],
    );
    assert.equal(stored?.vatCents, null, "no VAT while not VAT-registered");
    assert.deepEqual(
      harness.audit.events.map((event) => [event.category, event.action]),
      [
        ["money", "supplier.added"],
        ["money", "expense.recorded"],
      ],
    );
  });

  it("uses a supplier again by name, whatever its capitals", async () => {
    const harness = bookkeepingHarness();
    await recorded(harness);
    await recorded(harness, { supplierName: "  welkom HARDWARE " });
    assert.equal((await harness.expenseStore.suppliers()).length, 1);
    const [supplier] = await harness.expenseStore.suppliers();
    await recorded(harness, { supplierId: supplier!.id, supplierName: "" });
    assert.equal((await harness.expenses.list(owner, { limit: 10 })).expenses.every((entry) => entry.supplierName === "Welkom Hardware"), true);
  });

  it("credits where the money came from: the bank, a channel's payout (commission), or the owner personally", async () => {
    const harness = bookkeepingHarness();
    const noBank = await recorded(harness, { paidBy: "bank" });
    assert.equal((await harness.ledgerStore.journal(noBank.journalId!))?.lines[1]?.accountCode, "1000", "the books' Bank while no bank account is set up");
    const added = await harness.bank.addAccount(owner, { name: "Business cheque", bankName: "A bank", accountNumber: "62 1234 5678" });
    assert.ok(added.ok);
    const second = await harness.bank.addAccount(owner, { name: "Savings", bankName: "A bank", accountNumber: "9876543210" });
    assert.ok(second.ok);
    assert.deepEqual((await harness.expenses.record(owner, expense({ paidBy: "bank" }))).ok ? null : "refused", "refused", "must choose which bank account");
    const fromSavings = await recorded(harness, { paidBy: "bank", bankAccountId: second.id });
    assert.equal((await harness.ledgerStore.journal(fromSavings.journalId!))?.lines[1]?.accountCode, "1001");
    const commission = await recorded(harness, { paidBy: "channel", channelAccount: "1110", accountCode: "5000", supplierName: "Booking.com", description: "Commission for November" });
    assert.deepEqual(
      (await harness.ledgerStore.journal(commission.journalId!))?.lines.map((line) => [line.accountCode, line.debitCents, line.creditCents]),
      [
        ["5000", 45_000, 0],
        ["1110", 0, 45_000],
      ],
    );
    const personally = await recorded(harness, { paidBy: "owner" });
    assert.equal((await harness.ledgerStore.journal(personally.journalId!))?.lines[1]?.accountCode, "3000");
    const views = (await harness.expenses.list(owner, { limit: 10 })).expenses;
    assert.deepEqual(views.map((view) => view.paidFromName).sort(), ["Bank", "Savings ••3210", "Taken off Booking.com's payout", "The owner personally"]);
  });

  it("can buy equipment as an asset, but not post to income or depreciation", async () => {
    const harness = bookkeepingHarness();
    await recorded(harness, { accountCode: "1500", description: "Bar fridge" });
    for (const code of ["4000", "6200", "1510", "1000", "9999"]) {
      const result = await harness.expenses.record(owner, expense({ accountCode: code }));
      assert.equal(result.ok, false, code);
    }
  });

  it("refuses a day in a locked month with a field error, and says what's missing", async () => {
    const harness = bookkeepingHarness();
    await harness.ledgerService.lockPeriod(owner, "2026-10");
    assert.deepEqual(await harness.expenses.record(owner, expense({ date: "2026-10-20" })), {
      ok: false,
      errors: { date: "That month is locked in the books. Reopen it on the Months page first, or choose a day in an open month." },
    });
    const missing = await harness.expenses.record(owner, { date: "2026-11-10", supplierId: "new", accountCode: "5500", amount: "0", description: "", paidBy: "channel" });
    assert.equal(missing.ok, false);
    assert.deepEqual(Object.keys(missing.ok ? {} : missing.errors).sort(), ["amount", "channelAccount", "description", "supplierName"]);
    assert.equal(harness.ledgerState.journals.length, 0, "nothing posted");
    assert.equal((await harness.expenseStore.expenses({ limit: 10 })).length, 0, "nothing recorded");
  });
});

describe("voiding expenses", () => {
  it("keeps the expense, crossed out with its reason, and reverses its journal on its own date", async () => {
    const harness = bookkeepingHarness();
    const { id, journalId } = await recorded(harness);
    const voided = await harness.expenses.voidExpense(owner, id, { reason: "Entered twice" });
    assert.deepEqual(voided, { ok: true, postProblem: null });
    const detail = await harness.expenses.expense(owner, id);
    assert.equal(detail?.expense.voidReason, "Entered twice");
    assert.equal(detail?.voidJournal?.reversalOf, journalId);
    assert.equal(detail?.voidJournal?.date, "2026-11-10");
    assert.equal(detail?.expense.posted, true);
    assert.equal(await harness.balance("5500"), 0);
    assert.equal(await harness.balance("1010"), 0);
    assert.equal((await harness.expenses.voidExpense(owner, id, { reason: "again" })).ok, false);
    assert.deepEqual((await harness.expenses.list(owner, { limit: 10 })).totalCents, 0, "a voided expense doesn't count");
    assert.deepEqual((await harness.expenses.voidExpense(owner, id, {})).ok, false);
  });

  it("dates the reversal today when the expense's month has been locked since", async () => {
    const harness = bookkeepingHarness();
    const { id } = await recorded(harness, { date: "2026-10-28" });
    await harness.ledgerService.lockPeriod(owner, "2026-10");
    await harness.expenses.voidExpense(owner, id, { reason: "Wrong supplier" });
    const detail = await harness.expenses.expense(owner, id);
    assert.equal(detail?.voidJournal?.date, "2026-11-12");
    assert.match(detail?.voidJournal?.memo ?? "", /in a locked month/);
  });

  it("is the way to undo an expense's journal: the Journals page sends the owner here", async () => {
    const harness = bookkeepingHarness();
    const { journalId } = await recorded(harness);
    assert.deepEqual(await harness.ledgerService.reverseJournal(owner, journalId!, { reason: "Mistake" }), {
      ok: false,
      errors: { form: "This journal came from an expense. Void the expense instead, and the books follow." },
    });
  });

  it("takes a reversal already in the books as the void's, rather than reversing twice", async () => {
    const harness = bookkeepingHarness();
    const { id, journalId } = await recorded(harness);
    const reversal = await harness.reverse((await harness.ledgerStore.journal(journalId!))!);
    assert.deepEqual(await harness.expenses.voidExpense(owner, id, { reason: "Mistake" }), { ok: true, postProblem: null });
    assert.equal((await harness.expenseStore.expense(id))?.voidJournalId, reversal.id);
    assert.equal(harness.ledgerState.journals.length, 2, "no second reversal");
  });
});

describe("posting that couldn't happen at the time", () => {
  it("is tried again, once", async () => {
    const harness = bookkeepingHarness();
    const result = await recorded(harness);
    const supplierId = (await harness.expenseStore.expense(result.id))!.supplierId;
    const unposted = testExpense(supplierId, { id: "00000000-0000-4000-8000-0000000e0001" });
    await harness.expenseStore.addExpense(unposted);
    assert.equal((await harness.expenses.expense(owner, unposted.id))?.expense.posted, false);
    assert.deepEqual(await harness.expenses.retryPosting(owner, unposted.id), { ok: true });
    assert.deepEqual(await harness.expenses.retryPosting(owner, unposted.id), { ok: true });
    assert.equal((await harness.expenses.expense(owner, unposted.id))?.expense.posted, true);
    assert.equal(harness.ledgerState.journals.filter((journal) => journal.source?.id === unposted.id).length, 1);
  });
});

describe("receipts", () => {
  it("are checked for room first, kept once, and never on a voided expense", async () => {
    const harness = bookkeepingHarness();
    const { id } = await recorded(harness);
    assert.deepEqual(await harness.expenses.checkReceiptRoom(owner, id), { ok: true });
    assert.deepEqual(await harness.expenses.attachReceipt(owner, id, "00000000-0000-4000-8000-0000000f0001"), { ok: true });
    assert.equal((await harness.expenses.checkReceiptRoom(owner, id)).ok, false);
    assert.equal((await harness.expenses.attachReceipt(owner, id, "00000000-0000-4000-8000-0000000f0002")).ok, false);
    const other = await recorded(harness);
    await harness.expenses.voidExpense(owner, other.id, { reason: "Mistake" });
    assert.equal((await harness.expenses.checkReceiptRoom(owner, other.id)).ok, false);
    assert.equal(harness.audit.events.filter((event) => event.action === "expense.receipt-added").length, 1);
  });
});

describe("listing expenses", () => {
  it("filters by dates, supplier and account, and adds up what stands", async () => {
    const harness = bookkeepingHarness();
    await recorded(harness, { date: "2026-10-30", amount: "100" });
    const linen = await recorded(harness, { supplierName: "Free State Linen", accountCode: "5200", amount: "250.50" });
    await recorded(harness, { amount: "75" });
    const november = await harness.expenses.list(owner, { from: "2026-11-01", until: "2026-11-30", limit: 50 });
    assert.equal(november.expenses.length, 2);
    assert.equal(november.totalCents, 32_550);
    const supplierId = (await harness.expenseStore.expense(linen.id))!.supplierId;
    assert.deepEqual((await harness.expenses.list(owner, { supplierId, limit: 50 })).expenses.map((entry) => [entry.supplierName, entry.accountName]), [["Free State Linen", "Cleaning supplies and linen"]]);
    assert.equal((await harness.expenses.list(owner, { accountCode: "5500", limit: 50 })).totalCents, 17_500);
  });
});

describe("suppliers", () => {
  it("are added and changed, one per name", async () => {
    const harness = bookkeepingHarness();
    const added = await harness.expenses.addSupplier(owner, { name: "Welkom Hardware", notes: "" });
    assert.ok(added.ok);
    assert.deepEqual(await harness.expenses.addSupplier(owner, { name: "welkom hardware" }), { ok: false, errors: { name: "There's already a supplier with this name." } });
    assert.deepEqual(await harness.expenses.changeSupplier(owner, added.id, { name: "Welkom Hardware & Paint", notes: "Account number on the till slip" }), { ok: true });
    assert.deepEqual((await harness.expenses.suppliers(owner)).map((supplier) => [supplier.name, supplier.notes]), [["Welkom Hardware & Paint", "Account number on the till slip"]]);
  });
});

describe("who may handle expenses", () => {
  it("is the owner alone: admin, sales and staff are refused every method", async () => {
    const harness = bookkeepingHarness();
    const { id } = await recorded(harness);
    for (const role of ["admin", "sales", "staff"] as const) {
      const actor = testActor(role);
      const calls = [
        () => harness.expenses.options(actor),
        () => harness.expenses.list(actor, { limit: 5 }),
        () => harness.expenses.expense(actor, id),
        () => harness.expenses.record(actor, expense()),
        () => harness.expenses.voidExpense(actor, id, { reason: "x" }),
        () => harness.expenses.retryPosting(actor, id),
        () => harness.expenses.checkReceiptRoom(actor, id),
        () => harness.expenses.attachReceipt(actor, id, "f"),
        () => harness.expenses.suppliers(actor),
        () => harness.expenses.addSupplier(actor, { name: "x" }),
        () => harness.expenses.changeSupplier(actor, "s", { name: "x" }),
      ];
      for (const call of calls) await assert.rejects(call(), TestNotAllowedError, role);
    }
    assert.equal((await harness.expenseStore.expense(id))?.voidedAt, null);
  });
});
