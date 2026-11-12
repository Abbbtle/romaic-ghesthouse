import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can } from "@/lib/accounts/access";
import type { Actor } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { sequentialIds, type Clock } from "@/lib/kernel/ports";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { createMemoryLedgerStore } from "@/lib/ledger/testing/memory-store";
import { earliestJournalMonthBefore, reversedAmong } from "./journal-reads";

const owner: Actor = { id: "00000000-0000-4000-8000-0000000000a1", role: "owner", name: "Owner" };

function ledgerAt(clock: { now: Date }) {
  const time: Clock = { now: () => clock.now };
  return createLedgerService({
    store: createMemoryLedgerStore(),
    facts: { booking: async () => null, payments: async () => [], bookingsTouchedSince: async () => [] },
    clock: time,
    ids: sequentialIds("j"),
    audit: memoryAuditRecorder(),
    access: { can, assertCan },
    reportProblem: () => {},
    timeZone: "Africa/Johannesburg",
  });
}

const journal = (date: string, memo: string) => ({ date, memo, "line.0.account": "1000", "line.0.debit": "100", "line.1.account": "3000", "line.1.credit": "100" });

async function post(ledger: ReturnType<typeof ledgerAt>, fields: Record<string, string>): Promise<string> {
  const result = await ledger.postManual(owner, fields);
  assert.equal(result.ok, true);
  return result.ok ? result.id : "";
}

describe("which journals in a list have been reversed", () => {
  it("finds reversals dated after the list's dates, and a reversal shown with its original", async () => {
    const clock = { now: new Date("2026-10-05T08:00:00Z") };
    const ledger = ledgerAt(clock);
    const kept = await post(ledger, journal("2026-10-05", "Kept"));
    const undone = await post(ledger, journal("2026-10-05", "Undone later"));
    clock.now = new Date("2026-11-12T08:00:00Z");
    const reversal = await ledger.reverseJournal(owner, undone, { reason: "Wrong account" });
    assert.equal(reversal.ok, true);

    const october = await ledger.journals(owner, { from: "2026-10-01", until: "2026-10-31", limit: 50 });
    assert.deepEqual([...(await reversedAmong(ledger, owner, october))], [undone]);
    const everything = await ledger.journals(owner, { limit: 50 });
    const reversed = await reversedAmong(ledger, owner, everything);
    assert.equal(reversed.has(undone), true);
    assert.equal(reversed.has(kept), false);
  });

  it("finds the reversal of a journal dated ahead, which is dated before it", async () => {
    const clock = { now: new Date("2026-11-12T08:00:00Z") };
    const ledger = ledgerAt(clock);
    const ahead = await post(ledger, journal("2026-12-01", "Dated ahead"));
    assert.equal((await ledger.reverseJournal(owner, ahead, { reason: "Not needed" })).ok, true);
    const december = await ledger.journals(owner, { from: "2026-12-01", limit: 50 });
    assert.deepEqual([...(await reversedAmong(ledger, owner, december))], [ahead]);
  });

  it("asks about each journal when there are more since than one read holds", async () => {
    const clock = { now: new Date("2026-11-12T08:00:00Z") };
    const ledger = ledgerAt(clock);
    const first = await post(ledger, journal("2026-11-01", "First"));
    assert.equal((await ledger.reverseJournal(owner, first, { reason: "Wrong" })).ok, true);
    for (let count = 0; count < 200; count += 1) await post(ledger, journal("2026-11-12", `Filler ${count}`));
    const shown = await ledger.journals(owner, { until: "2026-11-01", limit: 50 });
    assert.deepEqual([...(await reversedAmong(ledger, owner, shown))], [first]);
  });
});

describe("the earliest journal's month", () => {
  it("finds the oldest journal dated before a day, or nothing", async () => {
    const clock = { now: new Date("2026-11-12T08:00:00Z") };
    const ledger = ledgerAt(clock);
    assert.equal(await earliestJournalMonthBefore(ledger, owner, "2026-03-01"), null);
    await post(ledger, journal("2026-01-20", "Opening balance"));
    await post(ledger, journal("2025-11-03", "Earlier"));
    await post(ledger, journal("2026-04-01", "In the year"));
    assert.equal(await earliestJournalMonthBefore(ledger, owner, "2026-03-01"), "2025-11");
    assert.equal(await earliestJournalMonthBefore(ledger, owner, "2025-11-03"), null);
  });
});
