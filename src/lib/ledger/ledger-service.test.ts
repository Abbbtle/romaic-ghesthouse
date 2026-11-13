import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testActor, TestNotAllowedError } from "@/lib/inventory/testing/harness";
import type { Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import type { Payment } from "@/lib/money/money";
import { createLedgerService } from "./ledger-service";
import type { BookingForLedger, LedgerAccess, LedgerPermission, MoneyFacts } from "./ports";
import { financialYearStart } from "./reports";
import { createMemoryLedgerStore, memoryLedgerState } from "./testing/memory-store";

const grants: Record<Role, readonly LedgerPermission[]> = { owner: ["ledger:view", "ledger:post", "periods:lock"], admin: [], sales: [], staff: [] };
const access: LedgerAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};
const owner = testActor("owner");

const bookingId = "00000000-0000-4000-8000-00000000d001";

function payment(fields: Partial<Payment>): Payment {
  return {
    id: `pay-${Math.random().toString(16).slice(2)}`,
    bookingId,
    kind: "deposit",
    method: "eft",
    amountCents: 60_000,
    receivedOn: "2026-11-02",
    reference: null,
    status: "received",
    receiptNumber: "RC-000001",
    providerRef: null,
    idempotencyKey: null,
    recordedBy: owner.id,
    createdAt: new Date("2026-11-02T10:00:00Z"),
    voidedAt: null,
    voidReason: null,
    ...fields,
  };
}

function harness(now = "2026-11-12T08:00:00Z") {
  let instant = new Date(now);
  const clock: Clock = { now: () => new Date(instant) };
  const state = memoryLedgerState();
  const store = createMemoryLedgerStore(state);
  let booking: BookingForLedger = { id: bookingId, ref: "RG-B2C3D", channel: "phone", status: "confirmed", totalCents: 240_000, checkedOutOn: null, extrasCents: 0 };
  const payments: Payment[] = [];
  const problems: string[] = [];
  const facts: MoneyFacts = {
    booking: async (id) => (id === bookingId ? { ...booking } : null),
    payments: async () => payments.map((entry) => ({ ...entry })),
    bookingsTouchedSince: async () => [bookingId],
  };
  let next = 0;
  const service = createLedgerService({
    store,
    facts,
    clock,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit: memoryAuditRecorder(),
    access,
    reportProblem: (message) => problems.push(message),
    timeZone: "Africa/Johannesburg",
  });
  const balance = async (code: string) => {
    const sums = await store.sums({});
    const sum = sums.find((entry) => entry.accountCode === code) ?? { debitCents: 0, creditCents: 0 };
    return sum.debitCents - sum.creditCents;
  };
  return {
    service,
    store,
    state,
    payments,
    problems,
    balance,
    setBooking: (fields: Partial<BookingForLedger>) => (booking = { ...booking, ...fields }),
    setNow: (value: string) => (instant = new Date(value)),
  };
}

describe("posting a booking's money", () => {
  it("holds money received before the stay as the guest's deposit, by how it was paid", async () => {
    const h = harness();
    h.payments.push(payment({ method: "eft", amountCents: 60_000 }), payment({ method: "cash", amountCents: 10_000, kind: "extra" }));
    assert.deepEqual(await h.service.sync(bookingId), { posted: 2, problems: [] });
    assert.equal(await h.balance("1000"), 60_000, "EFT in the bank");
    assert.equal(await h.balance("1010"), 10_000, "cash on hand");
    assert.equal(await h.balance("2000"), -70_000, "held for the guest (a credit)");
    assert.deepEqual(await h.service.sync(bookingId), { posted: 0, problems: [] }, "again posts nothing");
  });

  it("recognises the stay at check-out, applies the deposits, and takes later payments off the receivable", async () => {
    const h = harness();
    h.payments.push(payment({ amountCents: 60_000 }));
    await h.service.sync(bookingId);
    h.setBooking({ status: "checked-out", checkedOutOn: "2026-11-14" });
    h.setNow("2026-11-14T09:00:00Z");
    await h.service.sync(bookingId);
    assert.equal(await h.balance("4000"), -240_000, "accommodation income");
    assert.equal(await h.balance("2000"), 0, "no deposits left held");
    assert.equal(await h.balance("1200"), 180_000, "the guest still owes the rest");
    h.payments.push(payment({ kind: "balance", amountCents: 180_000, receivedOn: "2026-11-14", method: "card-machine" }));
    await h.service.sync(bookingId);
    assert.equal(await h.balance("1200"), 0, "settled");
    assert.equal(await h.balance("1000"), 240_000);
  });

  it("puts channel-collected money on that channel's receivable, and reverses a voided payment", async () => {
    const h = harness();
    h.setBooking({ channel: "booking-com" });
    const collected = payment({ method: "channel-collected", amountCents: 255_000 });
    h.payments.push(collected);
    await h.service.sync(bookingId);
    assert.equal(await h.balance("1110"), 255_000, "Booking.com owes it");
    h.payments[0] = { ...collected, voidedAt: new Date("2026-11-12T07:00:00Z"), voidReason: "Entered twice" };
    await h.service.sync(bookingId);
    assert.equal(await h.balance("1110"), 0);
    assert.equal(await h.balance("2000"), 0);
    const journals = await h.service.journals(owner, { limit: 10 });
    assert.match(journals[0]!.memo, /^Reverses .*Entered twice/);
  });

  it("refunds out of the deposit, and moves a posting from a locked month to today", async () => {
    const h = harness();
    await h.service.lockPeriod(owner, "2026-10");
    h.payments.push(payment({ amountCents: 60_000, receivedOn: "2026-10-30" }), payment({ kind: "refund", amountCents: 20_000, receivedOn: "2026-11-05" }));
    await h.service.sync(bookingId);
    assert.equal(await h.balance("2000"), -40_000);
    assert.equal(await h.balance("1000"), 40_000);
    const moved = h.state.journals.find((journal) => journal.memo.includes("locked month"));
    assert.equal(moved?.date, "2026-11-12");
  });
});

describe("manual journals, reversals and months", () => {
  const form = (fields: Record<string, string> = {}) => ({
    date: "2026-11-12",
    memo: "Owner's capital paid in",
    "line.0.account": "1000",
    "line.0.debit": "5000",
    "line.1.account": "3000",
    "line.1.credit": "5000",
    ...fields,
  });

  it("posts a balanced journal, refuses an unbalanced one, and reverses once", async () => {
    const h = harness();
    const posted = await h.service.postManual(owner, form());
    assert.equal(posted.ok, true);
    assert.deepEqual(await h.service.postManual(owner, form({ "line.1.credit": "4000" })), { ok: false, errors: { form: "Debits (R5,000) and credits (R4,000) must be equal." } });
    assert.deepEqual(await h.service.postManual(owner, form({ "line.1.debit": "10" })), { ok: false, errors: { "line.1.debit": "Enter the amount as a debit or a credit, not both." } });
    const id = posted.ok ? posted.id : "";
    const reversed = await h.service.reverseJournal(owner, id, { reason: "Typed the wrong amount" });
    assert.equal(reversed.ok, true);
    assert.equal(await h.balance("1000"), 0);
    assert.deepEqual(await h.service.reverseJournal(owner, id, { reason: "Again" }), { ok: false, errors: { form: "This journal was already reversed." } });
    assert.deepEqual(await h.service.reverseJournal(owner, reversed.ok ? reversed.id : "", { reason: "Undo the undo" }), {
      ok: false,
      errors: { form: "This journal is itself a reversal. Post the original again instead." },
    });
  });

  it("posts a form sent twice once, and won't reverse an automatic journal by hand", async () => {
    const h = harness();
    const key = "00000000-0000-4000-8000-0000000000ff";
    const first = await h.service.postManual(owner, form({ idempotencyKey: key }));
    const again = await h.service.postManual(owner, form({ idempotencyKey: key }));
    assert.deepEqual(again, first);
    assert.equal(h.state.journals.length, 1);
    h.payments.push(payment({ amountCents: 60_000 }));
    await h.service.sync(bookingId);
    const automatic = h.state.journals.find((journal) => journal.source?.type === "payment")!;
    assert.deepEqual(await h.service.reverseJournal(owner, automatic.id, { reason: "Wrong" }), {
      ok: false,
      errors: { form: "This journal came from a payment. Void the payment on its booking's money page instead, and the books follow." },
    });
    assert.equal((await h.service.reverseJournal(owner, first.ok ? first.id : "", { reason: "Typo" })).ok, true, "a manual one still can be");
  });

  it("refuses posting into a locked month until it's reopened with a reason", async () => {
    const h = harness();
    assert.deepEqual(await h.service.lockPeriod(owner, "2026-11"), { ok: true });
    assert.deepEqual(await h.service.postManual(owner, form()), { ok: false, errors: { date: "That month is locked. Reopen it first, or date the journal in an open month." } });
    assert.deepEqual(await h.service.lockPeriod(owner, "2026-12"), { ok: false, errors: { form: "A month can be locked once it has started." } });
    assert.equal((await h.service.unlockPeriod(owner, "2026-11", {})).ok, false, "needs a reason");
    assert.deepEqual(await h.service.unlockPeriod(owner, "2026-11", { reason: "Accountant's correction" }), { ok: true });
    assert.equal((await h.service.postManual(owner, form())).ok, true);
  });

  it("keeps system accounts on, and adds accounts by code", async () => {
    const h = harness();
    assert.deepEqual(await h.service.setAccountActive(owner, "1000", false), { ok: false, errors: { form: "Automatic postings use this account, so it stays on." } });
    assert.deepEqual(await h.service.addAccount(owner, { code: "5250", name: "Guest amenities" }), { ok: true });
    assert.equal((await h.service.chart(owner)).find((account) => account.code === "5250")?.kind, "expense");
    assert.deepEqual(await h.service.addAccount(owner, { code: "5250", name: "Again" }), { ok: false, errors: { code: "Another account already has this code." } });
  });
});

describe("statements", () => {
  it("balances: trial balance, profit, the balance sheet and cash flow agree", async () => {
    const h = harness();
    await h.service.postManual(owner, { date: "2026-03-01", memo: "Capital", "line.0.account": "1000", "line.0.debit": "10000", "line.1.account": "3000", "line.1.credit": "10000" });
    await h.service.postManual(owner, { date: "2026-11-03", memo: "Linen", "line.0.account": "5200", "line.0.debit": "1500", "line.1.account": "1000", "line.1.credit": "1500" });
    h.payments.push(payment({ amountCents: 240_000, receivedOn: "2026-11-02" }));
    h.setBooking({ status: "checked-out", checkedOutOn: "2026-11-10" });
    await h.service.sync(bookingId);
    const trial = await h.service.trialBalance(owner, "2026-11-30");
    assert.equal(trial.debitCents, trial.creditCents);
    const pl = await h.service.profitAndLoss(owner, { from: "2026-11-01", until: "2026-11-30" });
    assert.deepEqual([pl.incomeCents, pl.expenseCents, pl.profitCents], [240_000, 150_000, 90_000]);
    const sheet = await h.service.balanceSheet(owner, "2026-11-30");
    assert.equal(sheet.assetCents, sheet.liabilityCents + sheet.equityCents);
    assert.equal(sheet.yearStart, "2026-03-01");
    const flow = await h.service.cashFlow(owner, { from: "2026-11-01", until: "2026-11-30" });
    assert.deepEqual([flow.openingCents, flow.closingCents], [1_000_000, 1_090_000]);
    assert.deepEqual(flow.groups.map((group) => [group.group, group.inCents, group.outCents]), [["guests", 240_000, 0], ["expenses", 0, 150_000]]);
  });

  it("finds the financial year from the month it ends", () => {
    assert.equal(financialYearStart("2026-11-12", 2), "2026-03-01");
    assert.equal(financialYearStart("2027-02-10", 2), "2026-03-01");
    assert.equal(financialYearStart("2026-11-12", 12), "2026-01-01");
    assert.equal(financialYearStart("2026-05-01", 6), "2025-07-01");
  });
});

describe("who may do what", () => {
  it("refuses admin, sales and staff every ledger read and write", async () => {
    const h = harness();
    for (const role of ["admin", "sales", "staff"] as const) {
      const actor = testActor(role);
      await assert.rejects(h.service.chart(actor), TestNotAllowedError, role);
      await assert.rejects(h.service.journals(actor, { limit: 5 }), TestNotAllowedError, role);
      await assert.rejects(h.service.journal(actor, "j"), TestNotAllowedError, role);
      await assert.rejects(h.service.postManual(actor, {}), TestNotAllowedError, role);
      await assert.rejects(h.service.reverseJournal(actor, "j", {}), TestNotAllowedError, role);
      await assert.rejects(h.service.addAccount(actor, {}), TestNotAllowedError, role);
      await assert.rejects(h.service.setAccountActive(actor, "5250", false), TestNotAllowedError, role);
      await assert.rejects(h.service.periods(actor), TestNotAllowedError, role);
      await assert.rejects(h.service.lockPeriod(actor, "2026-10"), TestNotAllowedError, role);
      await assert.rejects(h.service.unlockPeriod(actor, "2026-10", {}), TestNotAllowedError, role);
      await assert.rejects(h.service.settings(actor), TestNotAllowedError, role);
      await assert.rejects(h.service.saveSettings(actor, {}), TestNotAllowedError, role);
      await assert.rejects(h.service.trialBalance(actor, "2026-11-30"), TestNotAllowedError, role);
      await assert.rejects(h.service.profitAndLoss(actor, { from: "2026-11-01", until: "2026-11-30" }), TestNotAllowedError, role);
      await assert.rejects(h.service.balanceSheet(actor, "2026-11-30"), TestNotAllowedError, role);
      await assert.rejects(h.service.cashFlow(actor, { from: "2026-11-01", until: "2026-11-30" }), TestNotAllowedError, role);
      await assert.rejects(h.service.financialYear(actor, "2026-11-30"), TestNotAllowedError, role);
    }
  });
});
