import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { payMemo, payMonths } from "./payroll";
import { taxHarness, testParameters, unverifiedFixture } from "./testing/harness";

const employeeForm = { name: "Lerato Dube", startDate: "2026-01-05", endDate: "", taxNumber: "0123 456 789", active: "on" };

const runForm = (employeeId: string, fields: Record<string, string> = {}) => ({
  employeeId,
  period: "2026-10",
  paidOn: "2026-10-30",
  gross: "8500",
  paye: "250",
  uifEmployee: "85",
  uifEmployer: "85",
  sdl: "",
  net: "",
  ...fields,
});

async function registered(parameters = testParameters()) {
  const h = taxHarness(parameters);
  await h.tax.recordRegistration(h.owner, { kind: "uif", registered: "yes", effectiveFrom: "2026-01-01" });
  const added = await h.payroll.addEmployee(h.owner, employeeForm);
  assert.ok(added.ok);
  return { ...h, employeeId: added.ok ? added.id : "" };
}

describe("payroll wording and months", () => {
  it("offers this month and the twelve before it, newest first", () => {
    const months = payMonths("2026-11-12");
    assert.equal(months.length, 13);
    assert.deepEqual(months.slice(0, 3), ["2026-11", "2026-10", "2026-09"]);
    assert.equal(months.at(-1), "2025-11");
    assert.deepEqual(payMonths("2027-03-31").slice(0, 2), ["2027-03", "2027-02"], "the last day of a long month");
  });

  it("names the month in words in the pay journal's memo", () => {
    assert.equal(payMemo("2026-10", "Test Employee"), "October 2026 pay: Test Employee");
    assert.equal(payMemo("2026-10"), "October 2026 pay");
  });
});

describe("payroll", () => {
  it("stays off until a PAYE, UIF or SDL registration is recorded", async () => {
    const h = taxHarness();
    assert.equal((await h.payroll.overview(h.owner)).on, false);
    const refused = await h.payroll.addEmployee(h.owner, employeeForm);
    assert.match(!refused.ok ? refused.errors.form! : "", /registration/);
  });

  it("seals an employee's tax number to them and shows only its last digits", async () => {
    const h = await registered();
    const { employees } = await h.payroll.overview(h.owner);
    assert.equal(employees[0]?.taxNumberLast4, "6789");
    assert.equal(JSON.stringify(employees).includes("0123456789"), false);
    assert.deepEqual(h.sealed, [{ secret: "0123456789", context: `employee-tax-number:${h.employeeId}` }]);
    assert.deepEqual(await h.payroll.updateEmployee(h.owner, h.employeeId, { ...employeeForm, taxNumber: "", name: "Lerato Mokoena" }), { ok: true });
    assert.equal((await h.payroll.overview(h.owner)).employees[0]?.taxNumberLast4, "6789", "an empty tax number keeps the one on record");
  });

  it("records a month's pay and posts it to the books", async () => {
    const h = await registered();
    const result = await h.payroll.recordRun(h.owner, runForm(h.employeeId));
    assert.deepEqual(result, { ok: true, id: result.ok ? result.id : "", warnings: [] });
    const run = (await h.payroll.runs(h.owner, {}))[0]!;
    assert.equal(run.netCents, 816_500, "gross less PAYE and the employee's UIF");
    assert.equal((await h.ledger.journal(h.owner, run.journalId!))?.journal.memo, "October 2026 pay: Lerato Dube");
    const balances = new Map((await h.ledger.trialBalance(h.owner, "2026-10-31")).rows.map((row) => [row.code, row]));
    assert.equal(balances.get("6000")?.debitCents, 850_000, "salaries");
    assert.equal(balances.get("6100")?.debitCents, 8_500, "employer UIF");
    assert.equal(balances.get("2200")?.creditCents, 25_000, "PAYE owed");
    assert.equal(balances.get("2210")?.creditCents, 17_000, "UIF owed, both halves");
    assert.equal(balances.get("1000")?.creditCents, 816_500, "net pay from the main bank");
    assert.equal(balances.has("2220"), false, "no SDL, no line");
  });

  it("warns, without refusing, when UIF or SDL differs from the verified parameters", async () => {
    const h = await registered();
    const result = await h.payroll.recordRun(h.owner, runForm(h.employeeId, { uifEmployer: "50", sdl: "85" }));
    assert.ok(result.ok);
    assert.deepEqual(result.ok ? result.warnings : [], [
      "The employer's UIF is R50; 1% of pay up to R17,712 gives R85.",
      "SDL is recorded, but no SDL registration is. Record it under Registrations if the business is registered.",
    ]);
  });

  it("works UIF out on pay up to the ceiling", async () => {
    const h = await registered();
    const result = await h.payroll.recordRun(h.owner, runForm(h.employeeId, { gross: "30000", paye: "5000", uifEmployee: "177.12", uifEmployer: "177.12" }));
    assert.deepEqual(result.ok ? result.warnings : null, []);
  });

  it("says when UIF can't be checked because its rates aren't verified", async () => {
    const h = await registered([...testParameters(), unverifiedFixture("uif.rates")]);
    const result = await h.payroll.recordRun(h.owner, runForm(h.employeeId));
    assert.match(result.ok ? result.warnings[0]! : "", /^UIF couldn't be checked: UIF contribution rates isn't verified/);
  });

  it("refuses net pay that isn't gross less PAYE and the employee's UIF, and a second run for the month", async () => {
    const h = await registered();
    const wrongNet = await h.payroll.recordRun(h.owner, runForm(h.employeeId, { net: "8000" }));
    assert.match(!wrongNet.ok ? wrongNet.errors.net! : "", /R8,165/);
    assert.ok((await h.payroll.recordRun(h.owner, runForm(h.employeeId))).ok);
    const twice = await h.payroll.recordRun(h.owner, runForm(h.employeeId));
    assert.ok(!twice.ok && twice.errors.period);
    const future = await h.payroll.recordRun(h.owner, runForm(h.employeeId, { period: "2026-11", paidOn: "2026-11-30" }));
    assert.ok(!future.ok && future.errors.paidOn);
  });

  it("voids a run by reversing its journal, keeping it on record", async () => {
    const h = await registered();
    const recorded = await h.payroll.recordRun(h.owner, runForm(h.employeeId));
    const id = recorded.ok ? recorded.id : "";
    assert.deepEqual(await h.payroll.voidRun(h.owner, id, { reason: "Wrong month" }), { ok: true });
    const run = (await h.payroll.runs(h.owner, {}))[0]!;
    assert.equal(run.voidReason, "Wrong month");
    assert.ok(run.reversalJournalId);
    assert.deepEqual((await h.ledger.trialBalance(h.owner, "2026-11-30")).rows, [], "posted and reversed: nothing left");
    assert.equal((await h.payroll.voidRun(h.owner, id, { reason: "Again" })).ok, false);
    assert.ok((await h.payroll.recordRun(h.owner, runForm(h.employeeId))).ok, "the month can be recorded again");
  });
});
