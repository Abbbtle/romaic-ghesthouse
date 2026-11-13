import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { createMemoryLedgerStore } from "@/lib/ledger/testing/memory-store";
import { taxLedgerFrom } from "@/lib/tax/ledger-port";
import { createPayrollService } from "@/lib/tax/payroll-service";
import { createTaxService } from "@/lib/tax/tax-service";
import { testParameters } from "@/lib/tax/testing/harness";
import { createMemoryPayrollStore, createMemoryTaxStore } from "@/lib/tax/testing/memory-stores";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

function services() {
  const clock = fixedClock("2026-11-12T08:00:00Z");
  const ids = sequentialIds();
  const audit = memoryAuditRecorder();
  const access = { can, assertCan };
  const ledger = createLedgerService({
    store: createMemoryLedgerStore(),
    facts: { booking: async () => null, payments: async () => [], bookingsTouchedSince: async () => [] },
    clock,
    ids,
    audit,
    access,
    reportProblem: () => {},
    timeZone: "Africa/Johannesburg",
  });
  const store = createMemoryTaxStore(testParameters());
  const payrollStore = createMemoryPayrollStore();
  const common = { ledger: taxLedgerFrom(ledger), vault: { seal: () => "sealed" }, clock, ids, audit, access, timeZone: "Africa/Johannesburg" };
  return {
    audit,
    tax: createTaxService({ ...common, store, payroll: payrollStore, proofFiles: { isProofOfSubmission: async () => true } }),
    payroll: createPayrollService({ ...common, store: payrollStore, tax: store }),
  };
}

const employee = { name: "Lerato Dube", startDate: "2026-01-05", endDate: "", taxNumber: "", active: "on" };

describe("tax and payroll with the real permission matrix (roles.md)", () => {
  it("lets the owner use tax and payroll", async () => {
    const { tax, payroll } = services();
    const owner = actor("owner");
    assert.ok((await tax.overview(owner)).vatWatch);
    assert.deepEqual(await tax.recordRegistration(owner, { kind: "uif", registered: "yes", effectiveFrom: "2026-01-01" }), { ok: true });
    assert.ok((await payroll.addEmployee(owner, employee)).ok);
    assert.equal((await tax.parameters(owner)).states.length > 0, true);
  });

  it("refuses admin (Weberu), sales and staff every tax and payroll method", async () => {
    const { tax, payroll, audit } = services();
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actor(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["overview", () => tax.overview(who)],
        ["parameters", () => tax.parameters(who)],
        ["addParameterVersion", () => tax.addParameterVersion(who, {})],
        ["registrations", () => tax.registrations(who)],
        ["recordRegistration", () => tax.recordRegistration(who, {})],
        ["returns", () => tax.returns(who)],
        ["taxReturn", () => tax.taxReturn(who, "x")],
        ["prepareChoices", () => tax.prepareChoices(who)],
        ["prepareReturn", () => tax.prepareReturn(who, {})],
        ["refreshReturn", () => tax.refreshReturn(who, "x")],
        ["reviewReturn", () => tax.reviewReturn(who, "x")],
        ["reopenReturn", () => tax.reopenReturn(who, "x")],
        ["discardReturn", () => tax.discardReturn(who, "x")],
        ["fileReturn", () => tax.fileReturn(who, "x", {}, "proof")],
        ["exportReturn", () => tax.exportReturn(who, "x")],
        ["printPack", () => tax.printPack(who, "x")],
        ["payroll.overview", () => payroll.overview(who)],
        ["payroll.addEmployee", () => payroll.addEmployee(who, employee)],
        ["payroll.updateEmployee", () => payroll.updateEmployee(who, "x", employee)],
        ["payroll.runs", () => payroll.runs(who, {})],
        ["payroll.recordRun", () => payroll.recordRun(who, {})],
        ["payroll.voidRun", () => payroll.voidRun(who, "x", {})],
      ];
      for (const [name, call] of calls) {
        await assert.rejects(call(), (error: unknown) => error instanceof NotAllowedError && /owner/.test(error.message), `${role}: ${name}`);
      }
    }
    assert.equal(audit.events.length, 0, "nothing was recorded");
  });
});
