import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actorWith, fixture, postIncome, taxHarness, testParameters, TestNotAllowed, unverifiedFixture } from "./testing/harness";

const register = (kind: string, fields: Record<string, string> = {}) => ({ kind, registered: "yes", effectiveFrom: "2026-03-01", ...fields });

const parameterForm = (fields: Record<string, string> = {}) => ({
  code: "vat.standard-rate",
  status: "verified",
  value: "15",
  effectiveFrom: "2026-03-01",
  effectiveTo: "",
  sourceUrl: "https://www.sars.gov.za/types-of-tax/value-added-tax/",
  sourceTitle: "Value-Added Tax",
  checkedOn: "2026-11-12",
  note: "VAT is levied at the standard rate of 15%.",
  ...fields,
});

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

describe("tax returns need verified parameters (brief rule 6)", () => {
  it("refuses an EMP201 when the EMP201 due date has no verified value, naming it", async () => {
    const h = taxHarness([...testParameters(), unverifiedFixture("paye.emp201-due")]);
    await h.tax.recordRegistration(h.owner, register("paye"));
    const result = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.errors.form! : "", /EMP201 due date isn't verified for 2026-10-31/);
    assert.equal((await h.tax.returns(h.owner)).length, 0, "nothing saved");
  });

  it("refuses a period no verified value covers", async () => {
    const h = taxHarness();
    await h.tax.recordRegistration(h.owner, register("paye", { effectiveFrom: "2025-01-01" }));
    const result = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-01" });
    assert.match(!result.ok ? result.errors.form! : "", /EMP201 due date has no value covering 2026-01-31/);
  });

  it("refuses a VAT201 when the standard rate isn't verified for the whole period", async () => {
    const h = taxHarness([...testParameters(), unverifiedFixture("vat.standard-rate", 2, "2026-10-01")]);
    await h.tax.recordRegistration(h.owner, register("vat", { vatCategory: "B" }));
    const result = await h.tax.prepareReturn(h.owner, { kind: "vat201", month: "2026-10" });
    assert.match(!result.ok ? result.errors.form! : "", /VAT standard rate isn't verified for 2026-10-31/);
  });

  it("refuses a parameter version that cites a page off sars.gov.za, and keeps the old version when a new one is added", async () => {
    const h = taxHarness();
    const elsewhere = await h.tax.addParameterVersion(h.owner, parameterForm({ sourceUrl: "https://www.example.co.za/vat-rates" }));
    assert.match(!elsewhere.ok ? elsewhere.errors.sourceUrl! : "", /sars\.gov\.za/);
    const lookalike = await h.tax.addParameterVersion(h.owner, parameterForm({ sourceUrl: "https://sars.gov.za.evil.example/vat" }));
    assert.equal(lookalike.ok, false);
    const unverified = await h.tax.addParameterVersion(h.owner, parameterForm({ status: "unverified", value: "", note: "The page didn't load." }));
    assert.deepEqual(unverified, { ok: true, version: 2 });
    const { states } = await h.tax.parameters(h.owner);
    const rate = states.find((state) => state.code === "vat.standard-rate")!;
    assert.equal(rate.versions.length, 2, "both versions kept");
    assert.equal(rate.lookup.status, "missing", "the newer, unverified version hides the old value");
    assert.equal(rate.versions[0]!.checkedBy, "Nico");
  });

  it("reads a parameter's value as its unit says", async () => {
    const h = taxHarness();
    assert.deepEqual(await h.tax.addParameterVersion(h.owner, parameterForm({ code: "vat.compulsory-threshold", value: "R2,300,000" })), { ok: true, version: 2 });
    const bad = await h.tax.addParameterVersion(h.owner, parameterForm({ code: "uif.rates", value: "1%" }));
    assert.match(!bad.ok ? bad.errors.value! : "", /JSON/);
    const states = (await h.tax.parameters(h.owner)).states;
    const threshold = states.find((state) => state.code === "vat.compulsory-threshold")!;
    assert.equal(threshold.lookup.status === "verified" && threshold.lookup.value, 230_000_000);
  });
});

describe("registrations", () => {
  it("start as not set, and switch modules on only once recorded", async () => {
    const h = taxHarness();
    const { current } = await h.tax.registrations(h.owner);
    assert.ok(Object.values(current).every((registration) => registration === null));
    const choices = await h.tax.prepareChoices(h.owner);
    assert.ok(choices.every((choice) => !choice.available), "nothing to prepare");
    const vatRefused = await h.tax.prepareReturn(h.owner, { kind: "vat201", month: "2026-10" });
    assert.match(!vatRefused.ok ? vatRefused.errors.form! : "", /VAT registration/);
  });

  it("seal the reference number to the record and keep only its last digits", async () => {
    const h = taxHarness();
    assert.deepEqual(await h.tax.recordRegistration(h.owner, register("vat", { vatCategory: "B", reference: "4123 456 789" })), { ok: true });
    const { current } = await h.tax.registrations(h.owner);
    assert.equal(current.vat?.referenceLast4, "6789");
    assert.equal(JSON.stringify(current).includes("4123456789"), false, "the number never comes back");
    assert.deepEqual(h.sealed, [{ secret: "4123456789", context: `tax-registration:${current.vat!.id}` }]);
    assert.equal(JSON.stringify(h.audit.events).includes("4123456789"), false, "nor goes in the audit log");
  });

  it("need a filing category for VAT and a legal form for income tax", async () => {
    const h = taxHarness();
    const vat = await h.tax.recordRegistration(h.owner, register("vat"));
    assert.ok(!vat.ok && vat.errors.vatCategory);
    const incomeTax = await h.tax.recordRegistration(h.owner, register("income-tax"));
    assert.ok(!incomeTax.ok && incomeTax.errors.legalForm);
  });
});

describe("the overview", () => {
  it("watches income over the last 12 months against the verified VAT threshold until VAT-registered", async () => {
    const h = taxHarness();
    assert.equal((await h.tax.overview(h.owner)).vatWatch?.level, "clear");
    await postIncome(h, "2026-06-15", 1_900_000);
    const watch = (await h.tax.overview(h.owner)).vatWatch!;
    assert.equal(watch.suppliesCents, 190_000_000);
    assert.equal(watch.level, "near");
    assert.equal(watch.threshold.status === "verified" && watch.threshold.cents, 230_000_000);
    await h.tax.recordRegistration(h.owner, register("vat", { vatCategory: "B" }));
    assert.equal((await h.tax.overview(h.owner)).vatWatch, null, "no watch once registered");
  });

  it("says the watch can't run when the threshold isn't verified", async () => {
    const h = taxHarness([...testParameters(), unverifiedFixture("vat.compulsory-threshold", 2, "2026-04-01")]);
    const watch = (await h.tax.overview(h.owner)).vatWatch!;
    assert.equal(watch.level, "unknown");
  });

  it("lists upcoming due dates from verified parameters and the registrations", async () => {
    const h = taxHarness();
    assert.deepEqual((await h.tax.overview(h.owner)).calendar.items, [], "nothing registered, nothing due");
    await h.tax.recordRegistration(h.owner, register("vat", { vatCategory: "B" }));
    await h.tax.recordRegistration(h.owner, register("paye"));
    const { items } = (await h.tax.overview(h.owner)).calendar;
    const vat = items.find((item) => item.kind === "vat201" && item.periodEnd === "2026-10-31");
    assert.equal(vat?.dueOn, "2026-11-30", "eFiling: the last business day of November");
    assert.equal(vat?.manualDueOn, "2026-11-25", "the 25th if not on eFiling");
    const emp = items.find((item) => item.kind === "emp201" && item.periodEnd === "2026-10-31");
    assert.equal(emp?.dueOn, "2026-11-06", "7 November is a Saturday, so the Friday before");
  });

  it("keeps a prepared return that isn't filed on the calendar once it's late, however long ago it was due", async () => {
    const h = taxHarness();
    await h.tax.recordRegistration(h.owner, register("income-tax", { legalForm: "sole-proprietor" }));
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "irp6", month: "2027-02", payment: "first" });
    const id = prepared.ok ? prepared.id : "";
    const { today, calendar } = await h.tax.overview(h.owner);
    const first = calendar.items.find((item) => item.returnId === id);
    assert.deepEqual(first && [first.dueOn, first.status, first.payment, first.month], ["2026-08-31", "draft", "first", "2027-02"], "73 days late: past the calendar's look-back, still shown");
    assert.equal(calendar.items.filter((item) => item.returnId === id).length, 1, "once");
    assert.equal(today, "2026-11-12");
  });
});

describe("preparing, reviewing and filing", () => {
  async function withPayroll() {
    const h = taxHarness();
    await h.tax.recordRegistration(h.owner, register("paye"));
    await h.tax.recordRegistration(h.owner, register("uif"));
    const employee = await h.payroll.addEmployee(h.owner, employeeForm);
    assert.ok(employee.ok);
    const run = await h.payroll.recordRun(h.owner, runForm(employee.ok ? employee.id : ""));
    assert.ok(run.ok, JSON.stringify(run));
    return h;
  }

  it("prepares an EMP201 from the month's recorded pay, with its due date", async () => {
    const h = await withPayroll();
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    assert.ok(prepared.ok, JSON.stringify(prepared));
    const taxReturn = (await h.tax.taxReturn(h.owner, prepared.ok ? prepared.id : ""))!;
    assert.equal(taxReturn.status, "draft");
    assert.equal(taxReturn.dueOn, "2026-11-06");
    const total = taxReturn.figures.lines.find((line) => line.key === "total");
    assert.equal(total?.cents, 25_000 + 8_500 + 8_500);
    assert.ok(taxReturn.parameters.some((parameter) => parameter.code === "paye.emp201-due"), "the version used is kept");
    assert.deepEqual(taxReturn.figures.warnings, []);
  });

  it("refuses to prepare a month that hasn't ended", async () => {
    const h = await withPayroll();
    const result = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-11" });
    assert.ok(!result.ok && result.errors.month);
  });

  it("moves a return from draft to reviewed to filed, with proof, and locks its month", async () => {
    const h = await withPayroll();
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    const id = prepared.ok ? prepared.id : "";
    h.proofs.add("proof-1");
    assert.equal((await h.tax.fileReturn(h.owner, id, { filedOn: "2026-11-05" }, "proof-1")).ok, false, "a draft can't be filed");
    assert.deepEqual(await h.tax.reviewReturn(h.owner, id), { ok: true });
    assert.equal((await h.tax.discardReturn(h.owner, id)).ok, false, "a reviewed return can't be discarded");
    const noProof = await h.tax.fileReturn(h.owner, id, { filedOn: "2026-11-05" }, null);
    assert.ok(!noProof.ok && noProof.errors.proof, "proof is needed");
    const unknownProof = await h.tax.fileReturn(h.owner, id, { filedOn: "2026-11-05" }, "not-a-proof");
    assert.ok(!unknownProof.ok && unknownProof.errors.proof);
    const early = await h.tax.fileReturn(h.owner, id, { filedOn: "2026-10-31" }, "proof-1");
    assert.ok(!early.ok && early.errors.filedOn, "not before the period ended");
    const filed = await h.tax.fileReturn(h.owner, id, { filedOn: "2026-11-05", submissionReference: "EMP-123" }, "proof-1");
    assert.deepEqual(filed, { ok: true, locked: ["2026-10"], notLocked: [] });
    assert.equal(await h.ledger.periodLocked("2026-10"), true);
    const taxReturn = (await h.tax.taxReturn(h.owner, id))!;
    assert.equal(taxReturn.status, "filed");
    assert.equal(taxReturn.proofFileId, "proof-1");
    assert.equal((await h.tax.reopenReturn(h.owner, id)).ok, false, "a filed return stays filed");
    assert.equal((await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" })).ok, false, "and isn't prepared again");
  });

  it("refreshes a draft in place, and only a draft", async () => {
    const h = await withPayroll();
    const first = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    const again = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    assert.deepEqual(again, { ok: true, id: first.ok ? first.id : "", refreshed: true });
    assert.deepEqual(await h.tax.refreshReturn(h.owner, first.ok ? first.id : ""), { ok: true });
    await h.tax.reviewReturn(h.owner, first.ok ? first.id : "");
    assert.equal((await h.tax.refreshReturn(h.owner, first.ok ? first.id : "")).ok, false);
    assert.deepEqual(await h.tax.reopenReturn(h.owner, first.ok ? first.id : ""), { ok: true });
    assert.deepEqual(await h.tax.discardReturn(h.owner, first.ok ? first.id : ""), { ok: true });
  });

  it("exports the figures and the journals behind them, with the disclaimer", async () => {
    const h = await withPayroll();
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "emp201", month: "2026-10" });
    const pack = (await h.tax.exportReturn(h.owner, prepared.ok ? prepared.id : ""))!;
    assert.equal(pack.fileName, "emp201-2026-10-01-to-2026-10-31.csv");
    assert.match(pack.csv, /^These figures are prepared from the books for review by the owner or their accountant\. Nothing is filed from this app\./);
    assert.match(pack.csv, /Total to pay SARS,420\.00/);
    assert.match(pack.csv, /2026-10-30,October 2026 pay: Lerato Dube,6000,Salaries and wages,8500\.00,/);
    assert.match(pack.csv, /https:\/\/www\.sars\.gov\.za\/test-fixture\//);
  });

  it("prepares a VAT201 once registered, with the VAT the books hold and a warning when there's none", async () => {
    const h = taxHarness();
    await h.tax.recordRegistration(h.owner, register("vat", { vatCategory: "B" }));
    await postIncome(h, "2026-09-10", 11_500);
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "vat201", month: "2026-10" });
    assert.ok(prepared.ok, JSON.stringify(prepared));
    const taxReturn = (await h.tax.taxReturn(h.owner, prepared.ok ? prepared.id : ""))!;
    assert.equal(taxReturn.periodStart, "2026-09-01");
    assert.equal(taxReturn.dueOn, "2026-11-30");
    assert.equal(taxReturn.figures.lines.find((line) => line.key === "vat-included")?.cents, 150_000);
    assert.equal(taxReturn.figures.warnings.length, 1);
    const wrongMonth = await h.tax.prepareReturn(h.owner, { kind: "vat201", month: "2026-09" });
    assert.ok(!wrongMonth.ok && wrongMonth.errors.month, "category B has no period ending in September");
  });

  it("works out the IRP6 estimate only when the legal form is set and its tables are verified", async () => {
    const h = taxHarness();
    await postIncome(h, "2026-04-15", 120_000);
    await h.tax.recordRegistration(h.owner, register("income-tax", { legalForm: "sole-proprietor" }));
    const first = await h.tax.prepareReturn(h.owner, { kind: "irp6", month: "2027-02", payment: "first" });
    assert.ok(first.ok, JSON.stringify(first));
    const worksheet = (await h.tax.taxReturn(h.owner, first.ok ? first.id : ""))!;
    assert.equal(worksheet.periodEnd, "2026-08-31");
    assert.equal(worksheet.dueOn, "2026-08-31");
    assert.equal(worksheet.figures.lines.find((line) => line.key === "estimate")?.cents, 24_000_000, "R120,000 over six months is R240,000 a year");
    // R240,000 at 18% is R43,200, less the R17,820 rebate: R25,380 for the year; half for the first payment.
    assert.equal(worksheet.figures.lines.find((line) => line.key === "payment")?.cents, 1_269_000);

    await h.tax.recordRegistration(h.owner, register("income-tax", { legalForm: "company" }));
    await h.tax.discardReturn(h.owner, worksheet.id);
    const company = await h.tax.prepareReturn(h.owner, { kind: "irp6", month: "2027-02", payment: "first" });
    const companySheet = (await h.tax.taxReturn(h.owner, company.ok ? company.id : ""))!;
    assert.equal(companySheet.figures.lines.some((line) => line.key === "tax"), false, "no company rate verified: no estimate");
    assert.ok(companySheet.figures.notes.some((note) => note.startsWith("No tax estimate: Company income tax rate has no value")));
  });

  it("refuses an IRP6 when the provisional tax dates aren't verified", async () => {
    const h = taxHarness([...testParameters(), unverifiedFixture("provisional.periods")]);
    await h.tax.recordRegistration(h.owner, register("income-tax", { legalForm: "company" }));
    const result = await h.tax.prepareReturn(h.owner, { kind: "irp6", month: "2027-02", payment: "second" });
    assert.match(!result.ok ? result.errors.form! : "", /Provisional tax \(IRP6\) due dates isn't verified/);
  });

  it("prepares turnover tax for an ended year under the verified table", async () => {
    const h = taxHarness([...testParameters(), fixture("turnover.rate-table", { bands: [{ overCents: 0, baseCents: 0, ratePercent: 1 }] }, "2025-03-01", "2026-02-28"), fixture("turnover.threshold", 100_000_000, "2025-03-01", "2026-03-31")]);
    await h.tax.recordRegistration(h.owner, register("turnover", { effectiveFrom: "2025-03-01" }));
    const refusedYear = await h.tax.prepareReturn(h.owner, { kind: "turnover", month: "2027-02" });
    assert.ok(!refusedYear.ok && refusedYear.errors.month, "the year hasn't ended");
    const prepared = await h.tax.prepareReturn(h.owner, { kind: "turnover", month: "2026-02" });
    assert.ok(prepared.ok, JSON.stringify(prepared));
  });
});

describe("who may use tax", () => {
  it("refuses admin, sales and staff every method", async () => {
    const h = taxHarness();
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actorWith(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["overview", () => h.tax.overview(who)],
        ["parameters", () => h.tax.parameters(who)],
        ["addParameterVersion", () => h.tax.addParameterVersion(who, parameterForm())],
        ["registrations", () => h.tax.registrations(who)],
        ["recordRegistration", () => h.tax.recordRegistration(who, register("paye"))],
        ["returns", () => h.tax.returns(who)],
        ["taxReturn", () => h.tax.taxReturn(who, "x")],
        ["prepareChoices", () => h.tax.prepareChoices(who)],
        ["prepareReturn", () => h.tax.prepareReturn(who, { kind: "emp201", month: "2026-10" })],
        ["refreshReturn", () => h.tax.refreshReturn(who, "x")],
        ["reviewReturn", () => h.tax.reviewReturn(who, "x")],
        ["reopenReturn", () => h.tax.reopenReturn(who, "x")],
        ["discardReturn", () => h.tax.discardReturn(who, "x")],
        ["fileReturn", () => h.tax.fileReturn(who, "x", { filedOn: "2026-11-05" }, "proof")],
        ["exportReturn", () => h.tax.exportReturn(who, "x")],
        ["printPack", () => h.tax.printPack(who, "x")],
        ["payroll.overview", () => h.payroll.overview(who)],
        ["payroll.addEmployee", () => h.payroll.addEmployee(who, employeeForm)],
        ["payroll.updateEmployee", () => h.payroll.updateEmployee(who, "x", employeeForm)],
        ["payroll.runs", () => h.payroll.runs(who, {})],
        ["payroll.recordRun", () => h.payroll.recordRun(who, runForm("x"))],
        ["payroll.voidRun", () => h.payroll.voidRun(who, "x", { reason: "x" })],
      ];
      for (const [name, call] of calls) await assert.rejects(call(), TestNotAllowed, `${role}: ${name}`);
    }
    assert.equal(h.audit.events.length, 0, "nothing happened");
  });
});
