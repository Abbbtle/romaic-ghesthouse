import type { NewTaxParameter } from "../parameters";
import type { EmployeeRecord, PayrollRun } from "../payroll";
import type { PayrollStore, TaxStore } from "../ports";
import type { RegistrationRecord } from "../registrations";
import type { TaxReturn } from "../returns";

/**
 * What every TaxStore and PayrollStore must do, as cases run against a
 * fresh store. Tax cases get the id of a stored proof-of-submission file
 * (Postgres checks the foreign key; memory doesn't care):
 *
 *   for (const { name, run } of taxStoreContract) it(name, async () => run(store, { proofFileId }));
 */
export type TaxStoreCase = { name: string; run: (store: TaxStore, context: { proofFileId: string }) => Promise<void> };
export type PayrollStoreCase = { name: string; run: (store: PayrollStore) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

let counter = 0;
export const nextTestId = () => `00000000-0000-4000-8000-0000000f${String((counter += 1)).padStart(4, "0")}`;

export function testParameter(fields: Partial<NewTaxParameter> = {}): NewTaxParameter {
  return {
    id: nextTestId(),
    code: "vat.standard-rate",
    value: 15,
    unit: "percent",
    effectiveFrom: "2025-05-01",
    effectiveTo: null,
    sourceUrl: "https://www.sars.gov.za/types-of-tax/value-added-tax/",
    sourceTitle: "Value-Added Tax",
    checkedOn: "2026-11-12",
    checkedBy: "Weberu, during the build",
    note: "VAT is levied at the standard rate of 15%.",
    status: "verified",
    createdAt: at,
    createdBy: null,
    ...fields,
  };
}

export function testRegistration(fields: Partial<RegistrationRecord> = {}): RegistrationRecord {
  return {
    id: nextTestId(),
    kind: "vat",
    registered: true,
    effectiveFrom: "2026-03-01",
    referenceLast4: "4567",
    referenceSealed: "sealed:4123456789",
    details: { vatCategory: "B" },
    recordedAt: at,
    recordedBy: ownerId,
    ...fields,
  };
}

export function testReturn(fields: Partial<TaxReturn> = {}): TaxReturn {
  return {
    id: nextTestId(),
    kind: "emp201",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    label: "EMP201 · Oct 2026",
    status: "draft",
    figures: { lines: [{ key: "total", label: "Total to pay SARS", cents: 123_456, strong: true }], notes: ["A note"], warnings: [], accounts: ["2200"] },
    parameters: [{ code: "paye.emp201-due", version: 1, value: { daysAfterMonthEnd: 7 }, sourceUrl: "https://www.sars.gov.za/types-of-tax/pay-as-you-earn/", checkedOn: "2026-11-12" }],
    dueOn: "2026-11-06",
    preparedAt: at,
    preparedBy: ownerId,
    reviewedAt: null,
    reviewedBy: null,
    filedOn: null,
    filedAt: null,
    filedBy: null,
    proofFileId: null,
    submissionReference: null,
    createdAt: at,
    ...fields,
  };
}

export function testEmployee(fields: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: nextTestId(),
    name: "Lerato Dube",
    startDate: "2026-01-05",
    endDate: null,
    active: true,
    taxNumberLast4: "6789",
    taxNumberSealed: "sealed:0123456789",
    createdAt: at,
    createdBy: ownerId,
    ...fields,
  };
}

export function testRun(employeeId: string, fields: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: nextTestId(),
    employeeId,
    period: "2026-10",
    paidOn: "2026-10-30",
    grossCents: 850_000,
    payeCents: 25_000,
    uifEmployeeCents: 8_500,
    uifEmployerCents: 8_500,
    sdlCents: 0,
    netCents: 816_500,
    journalId: null,
    reversalJournalId: null,
    recordedAt: at,
    recordedBy: ownerId,
    voidedAt: null,
    voidReason: null,
    ...fields,
  };
}

export const taxStoreContract: readonly TaxStoreCase[] = [
  {
    name: "numbers each parameter's versions in order and keeps every one as it was added",
    async run(store) {
      const first = testParameter();
      const second = testParameter({ value: 16, effectiveFrom: "2027-04-01", checkedOn: "2026-11-12" });
      const table = testParameter({
        code: "turnover.rate-table",
        unit: "table",
        value: { bands: [{ overCents: 0, baseCents: 0, ratePercent: 0 }, { overCents: 60_000_000, baseCents: 0, ratePercent: 1 }] },
        effectiveFrom: "2026-03-01",
        effectiveTo: "2027-02-28",
      });
      const unverified = testParameter({ code: "vat.long-stay-rule", unit: "rule", value: null, status: "unverified", note: "Only stated in a 2016 guide." });
      // A store may start seeded (Postgres is): numbering carries on from the last version of each code.
      const existing = await store.parameters();
      const last = (code: string) => Math.max(0, ...existing.filter((parameter) => parameter.code === code).map((parameter) => parameter.version));
      const [vat, turnover, longStay] = [last("vat.standard-rate"), last("turnover.rate-table"), last("vat.long-stay-rule")];
      expectSame(await store.addParameter(first), { status: "added", version: vat + 1 }, "first");
      expectSame(await store.addParameter(second), { status: "added", version: vat + 2 }, "second");
      expectSame(await store.addParameter(table), { status: "added", version: turnover + 1 }, "another code");
      expectSame(await store.addParameter(unverified), { status: "added", version: longStay + 1 }, "unverified");
      const stored = (await store.parameters()).filter((parameter) => [first.id, second.id, table.id, unverified.id].includes(parameter.id));
      expectSame(
        stored.sort((a, b) => a.id.localeCompare(b.id)),
        [
          { ...first, version: vat + 1 },
          { ...second, version: vat + 2 },
          { ...table, version: turnover + 1 },
          { ...unverified, version: longStay + 1 },
        ].sort((a, b) => a.id.localeCompare(b.id)),
        "read back",
      );
    },
  },
  {
    name: "refuses a verified version without a value, or an unverified one with one",
    async run(store) {
      expectSame((await store.addParameter(testParameter({ value: null }))).status, "invalid", "verified without a value");
      expectSame((await store.addParameter(testParameter({ status: "unverified", value: 15 }))).status, "invalid", "unverified with a value");
    },
  },
  {
    name: "keeps every registration record, oldest first, with its sealed reference",
    async run(store) {
      const first = testRegistration();
      const second = testRegistration({ kind: "paye", details: {}, referenceLast4: null, referenceSealed: null, recordedAt: later });
      const ended = testRegistration({ registered: false, effectiveFrom: "2026-10-31", details: {}, referenceLast4: null, referenceSealed: null, recordedAt: new Date("2026-11-12T10:00:00.000Z") });
      await store.recordRegistration(second);
      await store.recordRegistration(first);
      await store.recordRegistration(ended);
      expectSame(await store.registrations(), [first, second, ended], "history");
    },
  },
  {
    name: "keeps one return per kind and period, newest period first",
    async run(store) {
      const october = testReturn();
      const september = testReturn({ periodStart: "2026-09-01", periodEnd: "2026-09-30", label: "EMP201 · Sep 2026" });
      expectSame(await store.createReturn(september), "created", "september");
      expectSame(await store.createReturn(october), "created", "october");
      expectSame(await store.createReturn(testReturn()), "exists", "october again");
      expectSame(await store.createReturn(testReturn({ kind: "vat201", label: "VAT201" })), "created", "another kind, same months");
      expectSame(await store.taxReturn(october.id), october, "read back");
      expectSame((await store.returnFor("emp201", "2026-10-01", "2026-10-31"))?.id, october.id, "found by period");
      expectSame(await store.returnFor("emp201", "2026-08-01", "2026-08-31"), null, "no such period");
      expectSame((await store.returns()).filter((item) => item.kind === "emp201").map((item) => item.id), [october.id, september.id], "newest first");
    },
  },
  {
    name: "moves a return from draft to reviewed to filed, and refuses any other move",
    async run(store, { proofFileId }) {
      const draft = testReturn();
      await store.createReturn(draft);
      const refresh = {
        figures: { lines: [{ key: "total", label: "Total to pay SARS", cents: 99, strong: true }], notes: [], warnings: ["Check it"], accounts: ["2200", "2210"] },
        parameters: [],
        dueOn: "2026-11-06",
        label: "EMP201 · Oct 2026",
        preparedAt: later,
        preparedBy: ownerId,
      };
      expectSame(await store.refreshDraft(draft.id, refresh), true, "refresh a draft");
      expectSame(await store.markFiled(draft.id, { filedOn: "2026-11-05", filedAt: later, filedBy: ownerId, proofFileId, submissionReference: null }), false, "file a draft");
      expectSame(await store.markReviewed(draft.id, later, ownerId), true, "review");
      expectSame(await store.refreshDraft(draft.id, refresh), false, "refresh once reviewed");
      expectSame(await store.discardDraft(draft.id), false, "discard once reviewed");
      expectSame(await store.backToDraft(draft.id), true, "back to draft");
      expectSame(await store.markReviewed(draft.id, later, ownerId), true, "review again");
      expectSame(await store.markFiled(draft.id, { filedOn: "2026-11-05", filedAt: later, filedBy: ownerId, proofFileId, submissionReference: "SARS-123" }), true, "file");
      expectSame(await store.backToDraft(draft.id), false, "back to draft once filed");
      expectSame(await store.markReviewed(draft.id, later, ownerId), false, "review once filed");
      expectSame(await store.discardDraft(draft.id), false, "discard once filed");
      expectSame(
        await store.taxReturn(draft.id),
        { ...draft, ...refresh, status: "filed", reviewedAt: later, reviewedBy: ownerId, filedOn: "2026-11-05", filedAt: later, filedBy: ownerId, proofFileId, submissionReference: "SARS-123" },
        "filed",
      );
    },
  },
  {
    name: "discards a draft, and only a draft",
    async run(store) {
      const draft = testReturn();
      await store.createReturn(draft);
      expectSame(await store.discardDraft(draft.id), true, "discard");
      expectSame(await store.taxReturn(draft.id), null, "gone");
      expectSame(await store.discardDraft(draft.id), false, "again");
      expectSame(await store.createReturn(testReturn()), "created", "the period is free again");
    },
  },
];

export const payrollStoreContract: readonly PayrollStoreCase[] = [
  {
    name: "adds employees and saves their details, sorted by name",
    async run(store) {
      const lerato = testEmployee();
      const anele = testEmployee({ name: "Anele Khumalo", taxNumberLast4: null, taxNumberSealed: null });
      await store.addEmployee(lerato);
      await store.addEmployee(anele);
      expectSame((await store.employees()).map((employee) => employee.id), [anele.id, lerato.id], "by name");
      const changed = { ...lerato, name: "Lerato Mokoena", endDate: "2026-12-31", active: false, taxNumberLast4: "1111", taxNumberSealed: "sealed:1111" };
      expectSame(await store.updateEmployee(changed), true, "saved");
      expectSame(await store.employee(lerato.id), changed, "read back");
      expectSame(await store.updateEmployee(testEmployee()), false, "unknown employee");
    },
  },
  {
    name: "records one run per employee and month unless it's voided, and voids each once",
    async run(store) {
      const employee = testEmployee();
      await store.addEmployee(employee);
      const first = testRun(employee.id);
      expectSame(await store.recordRun(first), { status: "recorded" }, "first");
      expectSame(await store.recordRun(testRun(employee.id)), { status: "duplicate" }, "same month");
      expectSame(await store.run(first.id), first, "read back");
      expectSame(await store.voidRun(first.id, later, "Wrong amount", null), true, "void");
      expectSame(await store.voidRun(first.id, later, "Again", null), false, "void again");
      expectSame(await store.run(first.id), { ...first, voidedAt: later, voidReason: "Wrong amount" }, "voided");
      expectSame(await store.recordRun(testRun(employee.id, { grossCents: 900_000, netCents: 866_500 })), { status: "recorded" }, "the month again, once voided");
    },
  },
  {
    name: "lists runs by month and employee, newest month first",
    async run(store) {
      const lerato = testEmployee();
      const anele = testEmployee({ name: "Anele Khumalo" });
      await store.addEmployee(lerato);
      await store.addEmployee(anele);
      const september = testRun(lerato.id, { period: "2026-09", paidOn: "2026-09-30" });
      const october = testRun(lerato.id);
      const aneleOctober = testRun(anele.id);
      for (const run of [september, october, aneleOctober]) await store.recordRun(run);
      expectSame((await store.runs({ employeeId: lerato.id })).map((run) => run.id), [october.id, september.id], "one employee");
      expectSame((await store.runs({ period: "2026-10" })).map((run) => run.id).sort(), [october.id, aneleOctober.id].sort(), "one month");
      expectSame((await store.runs({}))[2]?.id, september.id, "oldest last");
    },
  },
];

/** JSON with object keys in order, so two stores may build records in different orders. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
