import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookkeepingHarness, testActor, TestNotAllowedError } from "./testing/harness";

const owner = testActor("owner");

const columns = {
  separator: ",",
  skipRows: "0",
  hasHeader: "on",
  dateColumn: "0",
  dateFormat: "yyyy-mm-dd",
  descriptionColumn: "1",
  referenceColumn: "",
  amountKind: "single",
  amountColumn: "2",
  balanceColumn: "3",
  decimal: ".",
};

const november = [
  "Date,Description,Amount,Balance",
  "2026-11-03,EFT T Mokoena RG-B2C3D,600.00,1600.00",
  "2026-11-04,Monthly fee,-35.00,1565.00",
  "2026-11-06,Booking.com payout,2400.00,3965.00",
  "2026-11-06,Spar Welkom,-120.50,3844.50",
  "",
].join("\n");

async function withAccount(harness = bookkeepingHarness()) {
  const added = await harness.bank.addAccount(owner, { name: "Business cheque", bankName: "A bank", accountNumber: "62-1234-5678" });
  assert.ok(added.ok, JSON.stringify(added));
  return { harness, accountId: added.id };
}

async function imported(text = november) {
  const { harness, accountId } = await withAccount();
  const result = await harness.bank.importStatement(owner, accountId, { fileName: "november.csv", text, mapping: columns });
  assert.ok(result.ok, JSON.stringify(result));
  const lines = await harness.bankStore.lines(accountId, { status: "all", limit: 50 });
  const byDescription = (description: string) => lines.find((line) => line.description === description)!;
  return { harness, accountId, result, lines, byDescription };
}

describe("bank accounts", () => {
  it("seals the number, shows only its last four digits, and puts the first account on the books' Bank", async () => {
    const { harness, accountId } = await withAccount();
    const account = await harness.bankStore.account(accountId);
    assert.deepEqual([account?.ledgerCode, account?.accountNumberLast4], ["1000", "5678"]);
    assert.equal(harness.bankStore.sealedNumbers.get(accountId), `sealed(bank-account:${accountId}):8765432126`);
    assert.ok(!JSON.stringify(account).includes("62123"), "the number isn't kept in the clear");
    assert.ok(!harness.audit.events.some((event) => event.summary.includes("62") && event.summary.includes("5678") && event.summary.includes("1234")), "nor in the audit log");
    assert.match(harness.audit.events.at(-1)?.summary ?? "", /••5678/);
  });

  it("gives later accounts their own account in the chart, from 1001", async () => {
    const { harness } = await withAccount();
    const second = await harness.bank.addAccount(owner, { name: "Savings", bankName: "Another bank", accountNumber: "1234567890" });
    assert.ok(second.ok);
    assert.equal((await harness.bankStore.account(second.id))?.ledgerCode, "1001");
    assert.deepEqual(harness.ledgerState.accounts.get("1001"), { code: "1001", name: "Savings", kind: "asset", system: true, active: true });
  });

  it("refuses a number that isn't digits, and asks for the names", async () => {
    const harness = bookkeepingHarness();
    const result = await harness.bank.addAccount(owner, { name: "", bankName: "", accountNumber: "12ab" });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.ok ? {} : result.errors).sort(), ["accountNumber", "bankName", "name"]);
  });
});

describe("importing statements", () => {
  it("keeps each line, saves the columns for next time, and counts what it did", async () => {
    const { harness, accountId, result, lines } = await imported();
    assert.deepEqual(result, { ok: true, added: 4, duplicates: 0, skipped: 0 });
    assert.equal(lines.length, 4);
    assert.deepEqual((await harness.bankStore.account(accountId))?.mapping?.amount, { kind: "single", column: 2 });
    assert.match(harness.audit.events.at(-1)?.summary ?? "", /Imported november\.csv into Business cheque: 4 new lines, 0 already there/);
  });

  it("adds only the new lines from an overlapping statement", async () => {
    const { harness, accountId } = await imported();
    const later = ["Date,Description,Amount,Balance", "2026-11-06,Spar Welkom,-120.50,3844.50", "2026-11-09,EFT J Smith,900.00,4744.50"].join("\r\n");
    assert.deepEqual(await harness.bank.importStatement(owner, accountId, { fileName: "overlap.csv", text: later, mapping: columns }), { ok: true, added: 1, duplicates: 1, skipped: 0 });
    assert.equal((await harness.bankStore.lines(accountId, { status: "all", limit: 50 })).length, 5);
    assert.deepEqual((await harness.bankStore.imports(accountId, 5)).map((entry) => [entry.fileName, entry.addedCount, entry.duplicateCount]), [
      ["overlap.csv", 1, 1],
      ["november.csv", 4, 0],
    ]);
  });

  it("leaves out rows it can't read, and refuses files it can't use", async () => {
    const { harness, accountId } = await withAccount();
    const withTotal = `${november}Closing balance,,,3844.50\n`;
    assert.deepEqual(await harness.bank.importStatement(owner, accountId, { fileName: "a.csv", text: withTotal, mapping: columns }), { ok: true, added: 4, duplicates: 0, skipped: 1 });
    const narrow = await harness.bank.importStatement(owner, accountId, { fileName: "b.csv", text: "Date,Amount\n2026-11-03,600\n", mapping: columns });
    assert.deepEqual(narrow, { ok: false, errors: { form: "Some of the columns chosen aren't in this file. Check the columns, or the separator." } });
    const unclosed = await harness.bank.importStatement(owner, accountId, { fileName: "c.csv", text: 'Date,Description,Amount,Balance\n2026-11-03,"open,600,1\n', mapping: columns });
    assert.equal(unclosed.ok ? null : unclosed.errors.file, "Row 2 opens a quote that never closes. Check the file, or try the other separator.");
    const huge = await harness.bank.importStatement(owner, accountId, { fileName: "d.csv", text: "x".repeat(1_048_577), mapping: columns });
    assert.equal(huge.ok ? null : huge.errors.file, "That file is larger than 1 MB. Export a shorter period from your bank.");
    const nothing = await harness.bank.importStatement(owner, accountId, { fileName: "e.csv", text: "Date,Description,Amount,Balance\nTotal,,,\n", mapping: columns });
    assert.equal(nothing.ok, false);
    const badColumns = await harness.bank.importStatement(owner, accountId, { fileName: "f.csv", text: november, mapping: { ...columns, amountColumn: "" } });
    assert.deepEqual(badColumns, { ok: false, errors: { amountColumn: "Choose the column with the amount." } });
  });
});

describe("reconciling lines", () => {
  it("suggests a guest's EFT already in the books: same account, same amount, within a week", async () => {
    const { harness, byDescription } = await imported();
    const eft = await harness.post("2026-11-01", 60_000);
    await harness.post("2026-11-03", 60_001, "A cent out");
    await harness.post("2026-10-20", 60_000, "Too early");
    await harness.post("2026-11-03", 60_000, "Another account", "1010");
    const reversed = await harness.post("2026-11-04", 60_000, "Reversed since");
    await harness.reverse(reversed);
    const detail = await harness.bank.line(owner, byDescription("EFT T Mokoena RG-B2C3D").id);
    assert.deepEqual(detail?.suggestions.map((suggestion) => [suggestion.journal.id, suggestion.daysApart]), [[eft.id, 2]]);
    assert.equal(detail?.line.status, "unmatched");
  });

  it("matches a line to a journal once, and unmatching leaves that journal alone", async () => {
    const { harness, accountId, byDescription } = await imported();
    const eft = await harness.post("2026-11-03", 60_000);
    const line = byDescription("EFT T Mokoena RG-B2C3D");
    assert.deepEqual(await harness.bank.matchJournal(owner, line.id, eft.id), { ok: true });
    assert.equal((await harness.bank.line(owner, line.id))?.line.status, "matched");
    assert.equal((await harness.bank.matchJournal(owner, line.id, eft.id)).ok, false, "already matched");
    const fee = byDescription("Monthly fee");
    assert.equal((await harness.bank.matchJournal(owner, fee.id, eft.id)).ok, false, "wrong amount and direction");
    assert.equal((await harness.bank.account(owner, accountId, { status: "unmatched", limit: 50 }))?.lines.length, 3);
    assert.deepEqual(await harness.bank.unmatch(owner, line.id), { ok: true });
    assert.equal(harness.ledgerState.journals.length, 1, "the EFT's journal stays, unreversed");
    assert.equal((await harness.bank.line(owner, line.id))?.suggestions[0]?.journal.id, eft.id, "and can be matched again");
  });

  it("makes journals from lines: bank charges, a channel's payout, the owner's money in and out", async () => {
    const { harness, byDescription } = await imported(
      [
        "Date,Description,Amount,Balance",
        "2026-11-04,Monthly fee,-35.00,965.00",
        "2026-11-06,Booking.com payout,2400.00,3365.00",
        "2026-11-07,Owner top-up,5000.00,8365.00",
        "2026-11-08,Owner groceries,-800.00,7565.00",
      ].join("\n"),
    );
    const make = async (description: string, input: Record<string, string>) => {
      const result = await harness.bank.makeJournal(owner, byDescription(description).id, input);
      assert.ok(result.ok, JSON.stringify(result));
      return (await harness.ledgerStore.journal(result.journalId))!;
    };
    const sides = (journal: Awaited<ReturnType<typeof make>>) => journal.lines.map((line) => [line.accountCode, line.debitCents, line.creditCents]);
    assert.deepEqual(sides(await make("Monthly fee", { kind: "bank-charges" })), [
      ["5100", 3_500, 0],
      ["1000", 0, 3_500],
    ]);
    const payout = await make("Booking.com payout", { kind: "channel-payout", account: "1110" });
    assert.deepEqual(sides(payout), [
      ["1000", 240_000, 0],
      ["1110", 0, 240_000],
    ]);
    assert.deepEqual([payout.date, payout.memo, payout.source], ["2026-11-06", "A channel's payout: Booking.com payout", { type: "bank-line", id: byDescription("Booking.com payout").id, part: "matched" }]);
    assert.deepEqual(sides(await make("Owner top-up", { kind: "owner" })), [
      ["1000", 500_000, 0],
      ["3000", 0, 500_000],
    ]);
    assert.deepEqual(sides(await make("Owner groceries", { kind: "owner" })), [
      ["3100", 80_000, 0],
      ["1000", 0, 80_000],
    ]);
    assert.ok(harness.balanced());
    assert.equal((await harness.bank.makeJournal(owner, byDescription("Monthly fee").id, { kind: "bank-charges" })).ok, false, "already matched");
    assert.equal((await harness.bank.makeJournal(owner, byDescription("Monthly fee").id, { kind: "channel-payout" })).ok, false, "a channel must be chosen");
  });

  it("records a transfer to another of the owner's accounts, and refuses accounts that aren't on offer", async () => {
    const { harness, byDescription } = await imported();
    const savings = await harness.bank.addAccount(owner, { name: "Savings", bankName: "A bank", accountNumber: "1234567890" });
    assert.ok(savings.ok);
    const line = byDescription("Spar Welkom");
    assert.deepEqual((await harness.bank.line(owner, line.id))?.choices.transfers.map((choice) => choice.code), ["1001", "1010", "1020"]);
    assert.equal((await harness.bank.makeJournal(owner, line.id, { kind: "transfer", account: "5100" })).ok, false);
    assert.equal((await harness.bank.makeJournal(owner, line.id, { kind: "other", account: "1000" })).ok, false, "not the account itself");
    const result = await harness.bank.makeJournal(owner, line.id, { kind: "transfer", account: "1001" });
    assert.ok(result.ok);
    assert.equal(await harness.balance("1001"), 12_050);
    // The same transfer on the savings statement: suggested, and matched to the same journal.
    const into = await harness.bank.importStatement(owner, savings.id, { fileName: "savings.csv", text: "Date,Description,Amount,Balance\n2026-11-07,Transfer in,120.50,120.50\n", mapping: columns });
    assert.ok(into.ok);
    const [savingsLine] = await harness.bankStore.lines(savings.id, { status: "all", limit: 5 });
    assert.deepEqual((await harness.bank.line(owner, savingsLine!.id))?.suggestions.map((suggestion) => suggestion.journal.id), [result.journalId]);
    assert.deepEqual(await harness.bank.matchJournal(owner, savingsLine!.id, result.journalId), { ok: true });
    assert.equal((await harness.bank.accounts(owner)).find((account) => account.id === savings.id)?.reconciliation.toReconcile, 0);
  });

  it("reverses a journal made from a line when it's unmatched, and makes a fresh one next time", async () => {
    const { harness, byDescription } = await imported();
    const line = byDescription("Monthly fee");
    const first = await harness.bank.makeJournal(owner, line.id, { kind: "bank-charges" });
    assert.ok(first.ok);
    assert.deepEqual(await harness.bank.unmatch(owner, line.id), { ok: true });
    const reversal = await harness.ledgerStore.reversalOf(first.journalId);
    assert.deepEqual([reversal?.date, reversal?.source], ["2026-11-04", { type: "bank-line", id: line.id, part: "unmatched:1" }]);
    assert.equal(await harness.balance("5100"), 0);
    const second = await harness.bank.makeJournal(owner, line.id, { kind: "other", account: "5700" });
    assert.ok(second.ok);
    assert.deepEqual((await harness.ledgerStore.journal(second.journalId))?.source?.part, "matched:2");
    assert.equal(await harness.balance("5700"), 3_500);
    assert.equal(await harness.balance("1000"), -3_500);
  });

  it("refuses to make a journal in a locked month, but matching one already there is fine", async () => {
    const { harness, byDescription } = await imported();
    const eft = await harness.post("2026-11-03", 60_000);
    await harness.ledgerService.lockPeriod(owner, "2026-11");
    assert.deepEqual(await harness.bank.makeJournal(owner, byDescription("Monthly fee").id, { kind: "bank-charges" }), { ok: false, errors: { form: "That month is locked in the books. Reopen it on the Months page first." } });
    assert.equal((await harness.bank.line(owner, byDescription("Monthly fee").id))?.locked, true);
    assert.deepEqual(await harness.bank.matchJournal(owner, byDescription("EFT T Mokoena RG-B2C3D").id, eft.id), { ok: true });
  });

  it("puts a line back to reconcile when its expense is voided, and it can be matched again", async () => {
    const { harness, accountId, byDescription } = await imported();
    const line = byDescription("Spar Welkom");
    const recorded = await harness.expenses.record(owner, {
      date: line.date,
      supplierId: "new",
      supplierName: "Spar Welkom",
      accountCode: "5200",
      amount: "120.50",
      description: "Cleaning things",
      paidBy: "bank",
      bankAccountId: accountId,
      bankLineId: line.id,
    });
    assert.ok(recorded.ok);
    assert.equal((await harness.bank.line(owner, line.id))?.suggestions[0]?.journal.id, recorded.journalId, "the expense is suggested");
    assert.deepEqual(await harness.bank.matchJournal(owner, line.id, recorded.journalId!), { ok: true });
    await harness.expenses.voidExpense(owner, recorded.id, { reason: "Wrong account" });
    const after = await harness.bank.line(owner, line.id);
    assert.equal(after?.line.status, "reversed");
    assert.equal((await harness.bank.unmatch(owner, line.id)).ok, false, "nothing to unmatch: its journal is reversed");
    const again = await harness.bank.makeJournal(owner, line.id, { kind: "other", account: "5500" });
    assert.ok(again.ok);
    assert.equal((await harness.bank.line(owner, line.id))?.line.status, "matched");
  });

  it("compares the statement's closing balance with the books on the same day", async () => {
    const { harness, accountId } = await imported();
    const before = (await harness.bank.account(owner, accountId, { status: "all", limit: 50 }))!.account.reconciliation;
    assert.deepEqual([before.statement, before.books, before.differenceCents, before.toReconcile, before.lineCount], [{ date: "2026-11-06", balanceCents: 384_450 }, { date: "2026-11-06", balanceCents: 0 }, 384_450, 4, 4]);
    await harness.post("2026-10-31", 100_000, "Opening balance", "1000", "3000");
    await harness.post("2026-11-03", 60_000);
    await harness.post("2026-11-04", -3_500, "Bank fee", "1000", "5100");
    await harness.post("2026-11-06", 240_000, "Payout", "1000", "1110");
    await harness.post("2026-11-06", -12_050, "Spar", "1000", "5200");
    await harness.post("2026-11-09", 1, "After the statement");
    const after = (await harness.bank.accounts(owner))[0]!.reconciliation;
    assert.equal(after.differenceCents, 0);
  });

  it("lists what's in the books on the account but on no line, once every line is matched and the balances still differ", async () => {
    const { harness, accountId, byDescription } = await imported();
    await harness.post("2026-10-31", 100_000, "Opening balance", "1000", "3000");
    const matches = [
      { description: "EFT T Mokoena RG-B2C3D", journal: await harness.post("2026-11-03", 60_000) },
      { description: "Monthly fee", journal: await harness.post("2026-11-04", -3_500, "Bank fee", "1000", "5100") },
      { description: "Booking.com payout", journal: await harness.post("2026-11-06", 240_000, "Payout", "1000", "1110") },
      { description: "Spar Welkom", journal: await harness.post("2026-11-06", -12_050, "Spar", "1000", "5200") },
    ];
    const detail = () => harness.bank.account(owner, accountId, { status: "all", limit: 50 });
    assert.equal((await detail())?.notOnStatement, null, "not while lines are still to match");
    for (const { description, journal } of matches) assert.deepEqual(await harness.bank.matchJournal(owner, byDescription(description).id, journal.id), { ok: true });
    assert.equal((await detail())?.notOnStatement, null, "nor once they match");

    await harness.post("2026-11-05", -50_000, "Pay run for October", "1000", "6000");
    await harness.reverse(await harness.post("2026-11-04", 7_000, "Posted twice"));
    await harness.post("2026-11-09", -1_000, "After the statement", "1000", "5100");
    await harness.post("2026-11-05", 9_000, "Into cash on hand", "1010", "2000");
    const after = await detail();
    assert.equal(after?.account.reconciliation.differenceCents, 50_000, "the books show R500 less than the bank");
    const found = after?.notOnStatement;
    assert.deepEqual(found && { from: found.from, until: found.until, memos: found.journals.map((journal) => journal.memo) }, { from: "2026-11-03", until: "2026-11-06", memos: ["Pay run for October"] });
  });

  it("finds the closing balance on a day whose lines came newest first", async () => {
    const newestFirst = ["Date,Description,Amount,Balance", "2026-11-06,Spar Welkom,-120.50,3844.50", "2026-11-06,Booking.com payout,2400.00,3965.00", "2026-11-03,EFT,600.00,1565.00"].join("\n");
    const { harness, accountId } = await imported(newestFirst);
    assert.deepEqual((await harness.bank.accounts(owner))[0]?.reconciliation.statement, { date: "2026-11-06", balanceCents: 384_450 });
    assert.ok(accountId);
  });
});

describe("who may handle the bank", () => {
  it("is the owner alone: admin, sales and staff are refused every method", async () => {
    const { harness, accountId, byDescription } = await imported();
    const lineId = byDescription("Monthly fee").id;
    for (const role of ["admin", "sales", "staff"] as const) {
      const actor = testActor(role);
      const calls = [
        () => harness.bank.accounts(actor),
        () => harness.bank.account(actor, accountId, { status: "all", limit: 5 }),
        () => harness.bank.addAccount(actor, { name: "x", bankName: "y", accountNumber: "1234" }),
        () => harness.bank.importStatement(actor, accountId, { fileName: "x.csv", text: november, mapping: columns }),
        () => harness.bank.line(actor, lineId),
        () => harness.bank.matchJournal(actor, lineId, "j"),
        () => harness.bank.makeJournal(actor, lineId, { kind: "bank-charges" }),
        () => harness.bank.unmatch(actor, lineId),
        () => harness.bank.lineForExpense(actor, lineId),
      ];
      for (const call of calls) await assert.rejects(call(), TestNotAllowedError, role);
    }
    assert.equal(harness.ledgerState.journals.length, 0);
  });
});
