import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { createMemoryLedgerStore } from "@/lib/ledger/testing/memory-store";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

function service() {
  return createLedgerService({
    store: createMemoryLedgerStore(),
    facts: { booking: async () => null, payments: async () => [], bookingsTouchedSince: async () => [] },
    clock: fixedClock("2026-11-12T08:00:00Z"),
    ids: sequentialIds(),
    audit: memoryAuditRecorder(),
    access: { can, assertCan },
    reportProblem: () => {},
    timeZone: "Africa/Johannesburg",
  });
}

const journal = { date: "2026-11-12", memo: "Capital", "line.0.account": "1000", "line.0.debit": "100", "line.1.account": "3000", "line.1.credit": "100" };

describe("the ledger with the real permission matrix (roles.md)", () => {
  it("lets the owner read, post, reverse and lock", async () => {
    const ledger = service();
    const owner = actor("owner");
    const posted = await ledger.postManual(owner, journal);
    assert.equal(posted.ok, true);
    assert.equal((await ledger.reverseJournal(owner, posted.ok ? posted.id : "", { reason: "Test" })).ok, true);
    assert.deepEqual(await ledger.lockPeriod(owner, "2026-10"), { ok: true });
    assert.deepEqual((await ledger.trialBalance(owner, "2026-11-30")).rows, [], "posted and reversed: nothing left");
  });

  it("refuses admin (Weberu), sales and staff every ledger path", async () => {
    const ledger = service();
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actor(role);
      await assert.rejects(ledger.chart(who), NotAllowedError, role);
      await assert.rejects(ledger.journals(who, { limit: 5 }), NotAllowedError, role);
      await assert.rejects(ledger.postManual(who, journal), NotAllowedError, role);
      await assert.rejects(ledger.reverseJournal(who, "j", { reason: "x" }), NotAllowedError, role);
      await assert.rejects(ledger.lockPeriod(who, "2026-10"), NotAllowedError, role);
      await assert.rejects(ledger.unlockPeriod(who, "2026-10", { reason: "x" }), NotAllowedError, role);
      await assert.rejects(ledger.saveSettings(who, {}), NotAllowedError, role);
      await assert.rejects(ledger.profitAndLoss(who, { from: "2026-11-01", until: "2026-11-30" }), NotAllowedError, role);
      await assert.rejects(ledger.balanceSheet(who, "2026-11-30"), NotAllowedError, role);
      await assert.rejects(ledger.cashFlow(who, { from: "2026-11-01", until: "2026-11-30" }), NotAllowedError, role);
      await assert.rejects(ledger.trialBalance(who, "2026-11-30"), NotAllowedError, role);
    }
  });
});
