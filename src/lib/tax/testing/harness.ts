import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock } from "@/lib/kernel/ports";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { createMemoryLedgerStore } from "@/lib/ledger/testing/memory-store";
import { taxLedgerFrom } from "../ledger-port";
import type { ParameterCode, TaxParameter } from "../parameters";
import { createPayrollService } from "../payroll-service";
import type { TaxAccess, TaxPermission } from "../ports";
import { createTaxService } from "../tax-service";
import { createMemoryPayrollStore, createMemoryTaxStore } from "./memory-stores";

/**
 * Tax and payroll over the real ledger, all in memory, for tests. Access is
 * a stand-in that lets only the owner through (the real matrix is tested in
 * src/server/tax-access.test.ts, where the accounts core may be used).
 *
 * The parameters are test fixtures in the shape of migration 340's seed,
 * not configuration: the app reads its values from the database.
 */

export class TestNotAllowed extends Error {
  constructor(readonly permission: string) {
    super(`not allowed: ${permission}`);
  }
}

export const ownerOnly: TaxAccess & { can(actor: Actor, permission: string): boolean; assertCan(actor: Actor, permission: string): void } = {
  can: (actor: Actor) => actor.role === "owner",
  assertCan(actor: Actor, permission: TaxPermission | string) {
    if (actor.role !== "owner") throw new TestNotAllowed(permission);
  },
};

export const actorWith = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role === "owner" ? "Nico" : role });

let fixtureId = 0;

/** A verified test parameter. */
export function fixture(code: ParameterCode, value: unknown, effectiveFrom = "2026-03-01", effectiveTo: string | null = null, fields: Partial<TaxParameter> = {}): TaxParameter {
  return {
    id: `00000000-0000-4000-8000-0000000c${String((fixtureId += 1)).padStart(4, "0")}`,
    code,
    version: 1,
    value,
    unit: "rule",
    effectiveFrom,
    effectiveTo,
    sourceUrl: "https://www.sars.gov.za/test-fixture/",
    sourceTitle: "Test fixture",
    checkedOn: "2026-11-12",
    checkedBy: "test",
    note: "Test fixture.",
    status: "verified",
    createdAt: new Date("2026-11-12T08:00:00Z"),
    createdBy: null,
    ...fields,
  };
}

/** An unverified test parameter. */
export function unverifiedFixture(code: ParameterCode, version = 2, effectiveFrom = "2026-03-01"): TaxParameter {
  return fixture(code, null, effectiveFrom, null, { status: "unverified", version, note: "The page didn't state it plainly." });
}

export function testParameters(): TaxParameter[] {
  return [
    fixture("vat.standard-rate", 15, "2025-05-01"),
    fixture("vat.compulsory-threshold", 230_000_000, "2026-04-01"),
    fixture("vat.voluntary-threshold", 12_000_000, "2026-04-01"),
    fixture("vat.filing-categories", {
      A: { months: 2, endMonths: [1, 3, 5, 7, 9, 11], who: "A" },
      B: { months: 2, endMonths: [2, 4, 6, 8, 10, 12], who: "B" },
      C: { months: 1, endMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], who: "C" },
      D: { months: 6, endMonths: [2, 8], who: "D" },
      E: { months: 12, endMonths: "year-end", who: "E" },
    }),
    fixture("vat.return-due", { manualDay: 25, efilingLastBusinessDay: true }),
    fixture("turnover.threshold", 230_000_000, "2026-04-01"),
    fixture("turnover.rate-table", { bands: [{ overCents: 0, baseCents: 0, ratePercent: 0 }, { overCents: 60_000_000, baseCents: 0, ratePercent: 1 }] }, "2026-03-01", "2027-02-28"),
    fixture("provisional.periods", { firstMonthsFromStart: 6, secondLastBusinessDayOfYear: true, thirdFebruaryYearEndMonth: 9, thirdOtherMonthsAfterEnd: 6 }),
    fixture("paye.emp201-due", { daysAfterMonthEnd: 7 }),
    fixture("uif.rates", { employeePercent: 1, employerPercent: 1 }),
    fixture("uif.ceiling", 1_771_200, "2021-06-01"),
    fixture("sdl.rate", 1),
    fixture("income-tax.individual-table", { bands: [{ overCents: 0, baseCents: 0, ratePercent: 18 }, { overCents: 24_510_000, baseCents: 4_411_800, ratePercent: 26 }] }, "2026-03-01", "2027-02-28"),
    fixture("income-tax.individual-rebates", { primaryCents: 1_782_000, secondaryCents: 976_500, tertiaryCents: 324_900 }, "2026-03-01", "2027-02-28"),
  ];
}

/** A whole tax setup over a fresh ledger on 12 November 2026 (a Thursday). */
export function taxHarness(parameters: TaxParameter[] = testParameters(), now = "2026-11-12T08:00:00Z") {
  const clock = fixedClock(now);
  let next = 0;
  const ids = { newId: () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, "0")}` };
  const audit = memoryAuditRecorder();
  const ledger = createLedgerService({
    store: createMemoryLedgerStore(),
    facts: { booking: async () => null, payments: async () => [], bookingsTouchedSince: async () => [] },
    clock,
    ids,
    audit,
    access: ownerOnly,
    reportProblem: () => {},
    timeZone: "Africa/Johannesburg",
  });
  const sealed: { secret: string; context: string }[] = [];
  const vault = {
    seal: (secret: string, context: string) => {
      sealed.push({ secret, context });
      return `sealed:${context}`;
    },
  };
  const proofs = new Set<string>();
  const taxStore = createMemoryTaxStore(parameters);
  const payrollStore = createMemoryPayrollStore();
  const common = { ledger: taxLedgerFrom(ledger), vault, clock, ids, audit, access: ownerOnly, timeZone: "Africa/Johannesburg" };
  const tax = createTaxService({ ...common, store: taxStore, payroll: payrollStore, proofFiles: { isProofOfSubmission: async (_actor, id) => proofs.has(id) } });
  const payroll = createPayrollService({ ...common, store: payrollStore, tax: taxStore });
  return { tax, payroll, ledger, taxStore, payrollStore, audit, sealed, proofs, owner: actorWith("owner") };
}

/** Posts income to the books: `rands` of accommodation received into the bank on `date`. */
export async function postIncome(harness: ReturnType<typeof taxHarness>, date: string, rands: number): Promise<void> {
  const result = await harness.ledger.postManual(harness.owner, { date, memo: "Stays", "line.0.account": "1000", "line.0.debit": String(rands), "line.1.account": "4000", "line.1.credit": String(rands) });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
}
