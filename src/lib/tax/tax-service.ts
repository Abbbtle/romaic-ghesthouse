import { parseWith } from "@/lib/forms/parse";
import { addDays, addMonths, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { LedgerAccount } from "@/lib/ledger/accounts";
import { normalBalance } from "@/lib/ledger/reports";
import { filingCalendar, vatWatch, type FilingCalendar, type VatWatch } from "./calendar";
import { exportFileName, returnCsv } from "./export";
import { lookUp, parameterCatalogue, parameterStates, type ParameterCode, type TaxParameter } from "./parameters";
import { emp201Due, firstDayOf, lastDayOf, monthOf, monthsBetween, provisionalPeriod, taxYearContaining, vatEndMonths, vatPeriodEnding, vatReturnDue, type ProvisionalPayment } from "./periods";
import type { PayrollStore, ProofFiles, TaxAccess, TaxLedger, TaxStore, TaxVault } from "./ports";
import { currentRegistrations, lastDigits, legalFormNames, registeredOn, registrationNames, type Registration, type RegistrationRecord, type RegistrationSet } from "./registrations";
import {
  emp201Figures,
  provisionalFigures,
  returnLabel,
  returnRequirements,
  turnoverFigures,
  usedParameter,
  vatFigures,
  type ReturnFigures,
  type ReturnKind,
  type TaxEstimateBasis,
  type TaxReturn,
  type UsedParameter,
} from "./returns";
import { fileReturnSchema, parameterValueFrom, parameterVersionSchema, prepareReturnSchema, registrationSchema } from "./tax-input";

export type TaxServiceDependencies = {
  store: TaxStore;
  payroll: PayrollStore;
  ledger: TaxLedger;
  vault: TaxVault;
  proofFiles: ProofFiles;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: TaxAccess;
  timeZone: string;
};

/** A return's period and figures, worked out but not yet saved. */
type Prepared = { periodStart: IsoDate; periodEnd: IsoDate; label: string; figures: ReturnFigures; parameters: UsedParameter[]; dueOn: IsoDate | null };

/** The periods the prepare form offers for each kind of return, or why it can't be prepared. */
export type PrepareChoice = { kind: ReturnKind; available: true; periods: { month: string; label: string }[]; payments: boolean } | { kind: ReturnKind; available: false; reason: string };

export type TaxOverview = {
  today: IsoDate;
  registrations: RegistrationSet;
  calendar: FilingCalendar;
  /** Shown until the business is registered for VAT. */
  vatWatch: VatWatch | null;
  /** Parameters with no verified value today. */
  unverified: ParameterCode[];
};

const reloadMessage = "Reload the page and try again.";

/** Kinds whose filing locks their months in the books. An IRP6 is an estimate made mid-year: locking its months would block the year-end adjustments the final return depends on. */
const locksOnFiling: readonly ReturnKind[] = ["vat201", "emp201", "turnover"];

/**
 * Tax: parameters, registrations, returns and the filing calendar. Owner
 * only (tax:manage; exports also need finance:export). Nothing is filed
 * from the app: returns are prepared for the owner or their accountant to
 * check and file on eFiling, then recorded here with the proof.
 */
export function createTaxService(deps: TaxServiceDependencies) {
  const { store, ledger, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor, action: string, target: { type: string; id: string }, summary: string, details?: Record<string, unknown>) {
    await audit.record({ actor, category: "tax", action, target, summary, details });
  }

  async function registrationSet(): Promise<RegistrationSet> {
    return currentRegistrations(await store.registrations());
  }

  /** The parameters a kind of return needs over a period, or the messages naming each one that's missing. */
  function requirementsFor(parameters: readonly TaxParameter[], kind: ReturnKind, periodStart: IsoDate, periodEnd: IsoDate): { ok: true; used: TaxParameter[] } | { ok: false; message: string } {
    const used: TaxParameter[] = [];
    const missing: string[] = [];
    for (const requirement of returnRequirements[kind]) {
      const dates = requirement.at === "end" ? [periodEnd] : [periodStart, periodEnd];
      for (const date of dates) {
        const lookup = lookUp(parameters, requirement.code, date);
        if (lookup.status === "missing") missing.push(lookup.message);
        else if (!used.some((parameter) => parameter.id === lookup.parameter.id)) used.push(lookup.parameter);
      }
    }
    if (missing.length > 0) return { ok: false, message: `This return can't be prepared: ${[...new Set(missing)].join(" ")}` };
    return { ok: true, used };
  }

  function valueOf<Code extends ParameterCode>(parameters: readonly TaxParameter[], code: Code, date: IsoDate) {
    const lookup = lookUp(parameters, code, date);
    if (lookup.status !== "verified") throw new Error(`${code} was checked as verified a moment ago`);
    return lookup.value;
  }

  async function books(actor: Actor, range: { from: IsoDate; until: IsoDate }): Promise<{ accounts: LedgerAccount[]; sums: Awaited<ReturnType<TaxLedger["sums"]>> }> {
    const [accounts, sums] = await Promise.all([ledger.accounts(actor), ledger.sums(range)]);
    return { accounts, sums };
  }

  /** The tables the IRP6 estimate needs for the legal form, or why it's left off. */
  function estimateBasis(parameters: readonly TaxParameter[], registration: Registration | null, yearEnd: IsoDate): TaxEstimateBasis {
    const legalForm = registration?.details.legalForm;
    if (!legalForm) return { status: "left-off", reason: "the business's legal form isn't set (Registrations › Income tax)." };
    if (legalForm === "sole-proprietor") {
      const table = lookUp(parameters, "income-tax.individual-table", yearEnd);
      const rebates = lookUp(parameters, "income-tax.individual-rebates", yearEnd);
      if (table.status === "missing") return { status: "left-off", reason: table.message };
      if (rebates.status === "missing") return { status: "left-off", reason: rebates.message };
      return { status: "estimate", legalForm, table: table.value, ratePercent: null, rebateCents: rebates.value.primaryCents, parameters: [table.parameter, rebates.parameter] };
    }
    if (legalForm === "small-business-corporation") {
      const table = lookUp(parameters, "income-tax.sbc-table", yearEnd);
      if (table.status === "missing") return { status: "left-off", reason: table.message };
      return { status: "estimate", legalForm, table: table.value, ratePercent: null, rebateCents: 0, parameters: [table.parameter] };
    }
    const rate = lookUp(parameters, "income-tax.company-rate", yearEnd);
    if (rate.status === "missing") return { status: "left-off", reason: rate.message };
    return { status: "estimate", legalForm, table: null, ratePercent: rate.value, rebateCents: 0, parameters: [rate.parameter] };
  }

  /** Works out a return's period and figures from the books, refusing when a registration or parameter it needs is missing. */
  async function prepare(actor: Actor, kind: ReturnKind, month: string, payment: ProvisionalPayment | undefined): Promise<{ ok: true; prepared: Prepared } | { ok: false; errors: Record<string, string> }> {
    const [parameters, registrations, settings] = await Promise.all([store.parameters(), registrationSet(), ledger.settings(actor)]);
    const now = today();
    const monthEnd = lastDayOf(month);

    switch (kind) {
      case "vat201": {
        const vat = registrations.vat;
        if (!registeredOn(registrations, "vat", monthEnd) || !vat?.details.vatCategory) return refusedWith("Record the VAT registration (with its filing category) under Registrations first.");
        const categories = lookUp(parameters, "vat.filing-categories", monthEnd);
        if (categories.status === "missing") return refusedWith(`This return can't be prepared: ${categories.message}`);
        const period = vatPeriodEnding(categories.value[vat.details.vatCategory], settings.yearEndMonth, month);
        if (!period) return refused({ month: `Category ${vat.details.vatCategory} has no VAT period ending in that month.` });
        if (period.end >= now) return refused({ month: `That period ends on ${period.end}: prepare it once it has ended.` });
        const needs = requirementsFor(parameters, kind, period.start, period.end);
        if (!needs.ok) return refusedWith(needs.message);
        const longStay = lookUp(parameters, "vat.long-stay-rule", period.end);
        const figures = vatFigures(await books(actor, { from: period.start, until: period.end }), valueOf(parameters, "vat.standard-rate", period.end), longStay.status === "verified");
        const due = vatReturnDue(valueOf(parameters, "vat.return-due", period.end), period.end);
        return { ok: true, prepared: { periodStart: period.start, periodEnd: period.end, label: returnLabel(kind, period.start, period.end), figures, parameters: needs.used.map(usedParameter), dueOn: due.efiling ?? due.manual } };
      }

      case "emp201": {
        if (!registeredOn(registrations, "paye", monthEnd)) return refusedWith("Record the PAYE registration under Registrations first.");
        if (monthEnd >= now) return refused({ month: "Prepare a month's EMP201 once the month has ended." });
        const start = firstDayOf(month);
        const needs = requirementsFor(parameters, kind, start, monthEnd);
        if (!needs.ok) return refusedWith(needs.message);
        const [runs, employees] = await Promise.all([deps.payroll.runs({ period: month }), deps.payroll.employees()]);
        const figures = emp201Figures(runs, employees, parameters, registeredOn(registrations, "sdl", monthEnd));
        const checks = (["uif.rates", "uif.ceiling", "sdl.rate"] as const).map((code) => lookUp(parameters, code, monthEnd)).flatMap((lookup) => (lookup.status === "verified" ? [lookup.parameter] : []));
        return {
          ok: true,
          prepared: { periodStart: start, periodEnd: monthEnd, label: returnLabel(kind, start, monthEnd), figures, parameters: [...needs.used, ...checks].map(usedParameter), dueOn: emp201Due(valueOf(parameters, "paye.emp201-due", monthEnd), month) },
        };
      }

      case "turnover": {
        const year = taxYearContaining(monthEnd, settings.yearEndMonth);
        if (year.end !== monthEnd) return refused({ month: "Choose the month the financial year ends in." });
        if (!registeredOn(registrations, "turnover", year.end)) return refusedWith("Record the turnover tax registration under Registrations first.");
        if (year.end >= now) return refused({ month: "Prepare the year's turnover tax once the year has ended." });
        const needs = requirementsFor(parameters, kind, year.start, year.end);
        if (!needs.ok) return refusedWith(needs.message);
        const figures = turnoverFigures(await books(actor, { from: year.start, until: year.end }), valueOf(parameters, "turnover.rate-table", year.end), valueOf(parameters, "turnover.threshold", year.end));
        return { ok: true, prepared: { periodStart: year.start, periodEnd: year.end, label: returnLabel(kind, year.start, year.end), figures, parameters: needs.used.map(usedParameter), dueOn: null } };
      }

      case "irp6": {
        if (!payment) return refused({ payment: "Choose the first or second payment." });
        const year = taxYearContaining(monthEnd, settings.yearEndMonth);
        if (year.end !== monthEnd) return refused({ month: "Choose the month the financial year ends in." });
        const registration = registrations["income-tax"];
        if (!registration?.registered || !registration.effectiveFrom || registration.effectiveFrom > year.end) return refusedWith("Record the income tax registration under Registrations first.");
        if (year.start > now) return refused({ month: "That year hasn't started yet." });
        const needs = requirementsFor(parameters, kind, year.start, year.end);
        if (!needs.ok) return refusedWith(needs.message);
        const period = provisionalPeriod(valueOf(parameters, "provisional.periods", year.end), year, payment);
        const asOf = period.end < now ? period.end : now;
        const basis = estimateBasis(parameters, registration, year.end);
        let firstPaymentCents: number | null = null;
        if (payment === "second") {
          const firstPeriod = provisionalPeriod(valueOf(parameters, "provisional.periods", year.end), year, "first");
          const first = await store.returnFor("irp6", firstPeriod.start, firstPeriod.end);
          if (first && first.status !== "draft") firstPaymentCents = first.figures.lines.find((line) => line.key === "payment")?.cents ?? null;
        }
        const figures = provisionalFigures(await books(actor, { from: year.start, until: asOf }), { yearStart: year.start, asOf, payment, basis, firstPaymentCents });
        const used = [...needs.used, ...(basis.status === "estimate" ? basis.parameters : [])];
        return { ok: true, prepared: { periodStart: period.start, periodEnd: period.end, label: returnLabel(kind, period.start, period.end, payment), figures, parameters: used.map(usedParameter), dueOn: period.due } };
      }
    }
  }

  async function prepareChoices(actor: Actor): Promise<PrepareChoice[]> {
    const [parameters, registrations, settings] = await Promise.all([store.parameters(), registrationSet(), ledger.settings(actor)]);
    const now = today();
    const recentMonths = monthsBetween(addMonths(now, -12), addDays(firstDayOf(monthOf(now)), -1)).reverse();
    const yearEnds = (count: number, ended: boolean) => {
      const current = taxYearContaining(now, settings.yearEndMonth);
      const ends: IsoDate[] = [];
      for (let index = ended ? 1 : 0; ends.length < count; index += 1) ends.push(taxYearContaining(addMonths(current.end, -12 * index), settings.yearEndMonth).end);
      return ends.map((end) => ({ month: monthOf(end), label: `Year to ${end}` }));
    };
    const vat = registrations.vat;
    const vatChoice = (): PrepareChoice => {
      if (!vat?.registered || !vat.details.vatCategory) return { kind: "vat201", available: false, reason: "Not registered for VAT. Record the registration under Registrations to prepare VAT201s." };
      const categories = lookUp(parameters, "vat.filing-categories", now);
      if (categories.status === "missing") return { kind: "vat201", available: false, reason: categories.message };
      const ends = vatEndMonths(categories.value[vat.details.vatCategory], settings.yearEndMonth);
      const periods = recentMonths.filter((month) => ends.includes(Number(month.slice(5, 7))) && (!vat.effectiveFrom || lastDayOf(month) >= vat.effectiveFrom));
      return { kind: "vat201", available: true, periods: periods.map((month) => ({ month, label: `Period ending ${lastDayOf(month)}` })), payments: false };
    };
    const paye = registrations.paye;
    return [
      vatChoice(),
      paye?.registered
        ? { kind: "emp201", available: true, periods: recentMonths.filter((month) => !paye.effectiveFrom || lastDayOf(month) >= paye.effectiveFrom).map((month) => ({ month, label: month })), payments: false }
        : { kind: "emp201", available: false, reason: "Not registered for PAYE. Record the registration under Registrations to prepare EMP201s." },
      registrations["income-tax"]?.registered
        ? { kind: "irp6", available: true, periods: yearEnds(2, false), payments: true }
        : { kind: "irp6", available: false, reason: "No income tax registration is recorded. Record it (with the legal form) under Registrations." },
      registrations.turnover?.registered
        ? { kind: "turnover", available: true, periods: yearEnds(3, true), payments: false }
        : { kind: "turnover", available: false, reason: "Not registered for turnover tax." },
    ];
  }

  return {
    today,

    // --- overview -----------------------------------------------------------------------------

    async overview(actor: Actor): Promise<TaxOverview> {
      access.assertCan(actor, "tax:manage");
      const now = today();
      const [parameters, registrations, settings, returns] = await Promise.all([store.parameters(), registrationSet(), ledger.settings(actor), store.returns()]);
      const calendar = filingCalendar({ today: now, parameters, registrations, yearEndMonth: settings.yearEndMonth, returns });
      let watch: VatWatch | null = null;
      if (!registeredOn(registrations, "vat", now)) {
        const from = addDays(addMonths(now, -12), 1);
        const { accounts, sums } = await books(actor, { from, until: now });
        const income = accounts.filter((account) => account.kind === "income");
        const supplies = income.reduce((total, account) => total + normalBalance("income", sums.find((sum) => sum.accountCode === account.code) ?? { debitCents: 0, creditCents: 0 }), 0);
        watch = vatWatch(parameters, now, supplies);
      }
      const unverified = parameterStates(parameters, now)
        .filter((state) => state.lookup.status === "missing")
        .map((state) => state.code);
      return { today: now, registrations, calendar, vatWatch: watch, unverified };
    },

    // --- parameters ---------------------------------------------------------------------------

    async parameters(actor: Actor) {
      access.assertCan(actor, "tax:manage");
      const now = today();
      return { today: now, states: parameterStates(await store.parameters(), now) };
    },

    /** Adds a new version of a parameter, checked on sars.gov.za. Earlier versions stay as they were. */
    async addParameterVersion(actor: Actor, input: unknown): Promise<ChangeResult<{ version: number }>> {
      access.assertCan(actor, "tax:manage");
      const parsed = parseWith(parameterVersionSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      const code = draft.code as ParameterCode;
      if (draft.checkedOn > today()) return refused({ checkedOn: "Choose today or an earlier day." });
      let value: unknown = null;
      if (draft.status === "verified") {
        const read = parameterValueFrom(code, draft.value ?? "");
        if (!read.ok) return refused({ value: read.message });
        value = read.value;
      }
      const outcome = await store.addParameter({
        id: ids.newId(),
        code,
        value,
        unit: parameterCatalogue[code].unit,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
        sourceUrl: draft.sourceUrl,
        sourceTitle: draft.sourceTitle,
        checkedOn: draft.checkedOn,
        checkedBy: actor.name,
        note: draft.note,
        status: draft.status,
        createdAt: clock.now(),
        createdBy: actor.id,
      });
      if (outcome.status !== "added") return refusedWith(outcome.reason);
      await record(actor, "tax.parameter-added", { type: "tax-parameter", id: code }, `Added ${parameterCatalogue[code].name} version ${outcome.version} (${draft.status}), from ${draft.effectiveFrom}`, {
        sourceUrl: draft.sourceUrl,
        checkedOn: draft.checkedOn,
      });
      return done({ version: outcome.version });
    },

    // --- registrations ------------------------------------------------------------------------

    async registrations(actor: Actor): Promise<{ current: RegistrationSet; history: Registration[] }> {
      access.assertCan(actor, "tax:manage");
      const history = (await store.registrations()).map(withoutReference);
      return { current: currentRegistrations(history), history: [...history].reverse() };
    },

    /** Records a registration (or that one ended). The reference number is sealed to this record; only its last digits are kept readable. */
    async recordRegistration(actor: Actor, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "tax:manage");
      const parsed = parseWith(registrationSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { kind, registered, effectiveFrom, reference, vatCategory, legalForm } = parsed.value;
      const id = ids.newId();
      const isRegistered = registered === "yes";
      const details = isRegistered ? { ...(kind === "vat" && vatCategory ? { vatCategory } : {}), ...(kind === "income-tax" && legalForm ? { legalForm } : {}) } : {};
      const recordToStore: RegistrationRecord = {
        id,
        kind,
        registered: isRegistered,
        effectiveFrom,
        referenceLast4: reference ? lastDigits(reference) : null,
        referenceSealed: reference ? deps.vault.seal(reference, `tax-registration:${id}`) : null,
        details,
        recordedAt: clock.now(),
        recordedBy: actor.id,
      };
      await store.recordRegistration(recordToStore);
      const extra = details.vatCategory ? ` (category ${details.vatCategory})` : details.legalForm ? ` (${legalFormNames[details.legalForm]})` : "";
      await record(
        actor,
        "tax.registration-recorded",
        { type: "tax-registration", id: kind },
        `${registrationNames[kind]}: ${isRegistered ? `registered from ${effectiveFrom}${extra}` : `not registered from ${effectiveFrom}`}`,
      );
      return done();
    },

    // --- returns ------------------------------------------------------------------------------

    async returns(actor: Actor): Promise<TaxReturn[]> {
      access.assertCan(actor, "tax:manage");
      return store.returns();
    },

    async taxReturn(actor: Actor, id: string): Promise<TaxReturn | null> {
      access.assertCan(actor, "tax:manage");
      return store.taxReturn(id);
    },

    prepareChoices: async (actor: Actor) => {
      access.assertCan(actor, "tax:manage");
      return prepareChoices(actor);
    },

    /** Prepares a return as a draft, or refreshes the draft already there. Refused, naming the parameter, when one it needs isn't verified for the period. */
    async prepareReturn(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string; refreshed: boolean }>> {
      access.assertCan(actor, "tax:manage");
      const parsed = parseWith(prepareReturnSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { kind, month, payment } = parsed.value;
      const result = await prepare(actor, kind, month, payment);
      if (!result.ok) return result;
      const { prepared } = result;
      const existing = await store.returnFor(kind, prepared.periodStart, prepared.periodEnd);
      if (existing) {
        if (existing.status === "filed") return refusedWith("That return is filed already. Open it from the list.");
        if (existing.status === "reviewed") return refusedWith("That return is marked reviewed. Set it back to draft to refresh its figures.");
        const refreshed = await store.refreshDraft(existing.id, { ...prepared, preparedAt: clock.now(), preparedBy: actor.id });
        if (!refreshed) return refusedWith(reloadMessage);
        await record(actor, "tax.return-refreshed", { type: "tax-return", id: existing.id }, `Refreshed ${prepared.label}`);
        return done({ id: existing.id, refreshed: true });
      }
      const at = clock.now();
      const taxReturn: TaxReturn = {
        id: ids.newId(),
        kind,
        ...prepared,
        status: "draft",
        preparedAt: at,
        preparedBy: actor.id,
        reviewedAt: null,
        reviewedBy: null,
        filedOn: null,
        filedAt: null,
        filedBy: null,
        proofFileId: null,
        submissionReference: null,
        createdAt: at,
      };
      if ((await store.createReturn(taxReturn)) === "exists") return refusedWith("Someone prepared that return a moment ago. Reload the page.");
      await record(actor, "tax.return-prepared", { type: "tax-return", id: taxReturn.id }, `Prepared ${prepared.label}`);
      return done({ id: taxReturn.id, refreshed: false });
    },

    /** Works a draft's figures out again from the books as they are now. */
    async refreshReturn(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tax:manage");
      const existing = await store.taxReturn(id);
      if (!existing) return refusedWith(reloadMessage);
      if (existing.status !== "draft") return refusedWith("Only a draft's figures can be refreshed.");
      const result = await prepare(actor, existing.kind, monthOf(existing.kind === "irp6" ? taxYearEndOf(existing) : existing.periodEnd), existing.figures.payment);
      if (!result.ok) return result;
      if (!(await store.refreshDraft(id, { ...result.prepared, preparedAt: clock.now(), preparedBy: actor.id }))) return refusedWith(reloadMessage);
      await record(actor, "tax.return-refreshed", { type: "tax-return", id }, `Refreshed ${existing.label}`);
      return done();
    },

    async reviewReturn(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tax:manage");
      const existing = await store.taxReturn(id);
      if (!existing) return refusedWith(reloadMessage);
      if (!(await store.markReviewed(id, clock.now(), actor.id))) return refusedWith("Only a draft can be marked reviewed.");
      await record(actor, "tax.return-reviewed", { type: "tax-return", id }, `Marked ${existing.label} reviewed`);
      return done();
    },

    async reopenReturn(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tax:manage");
      const existing = await store.taxReturn(id);
      if (!existing) return refusedWith(reloadMessage);
      if (!(await store.backToDraft(id))) return refusedWith("Only a reviewed return can go back to draft. A filed one stays filed.");
      await record(actor, "tax.return-reopened", { type: "tax-return", id }, `Set ${existing.label} back to draft`);
      return done();
    },

    async discardReturn(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tax:manage");
      const existing = await store.taxReturn(id);
      if (!existing) return refusedWith(reloadMessage);
      if (!(await store.discardDraft(id))) return refusedWith("Only a draft can be discarded. Reviewed and filed returns stay on record.");
      await record(actor, "tax.return-discarded", { type: "tax-return", id }, `Discarded the draft ${existing.label}`);
      return done();
    },

    /**
     * Records that a reviewed return was filed on eFiling: the date, the
     * proof of submission (a private file already stored) and SARS's
     * reference if noted. Then locks its months in the books (not an
     * IRP6's), saying which couldn't be locked.
     */
    async fileReturn(actor: Actor, id: string, input: unknown, proofFileId: string | null): Promise<ChangeResult<{ locked: string[]; notLocked: string[] }>> {
      access.assertCan(actor, "tax:manage");
      const parsed = parseWith(fileReturnSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const existing = await store.taxReturn(id);
      if (!existing) return refusedWith(reloadMessage);
      if (existing.status !== "reviewed") return refusedWith(existing.status === "filed" ? "That return is filed already." : "Mark the return reviewed before recording it as filed.");
      const { filedOn, submissionReference } = parsed.value;
      if (filedOn > today()) return refused({ filedOn: "Choose today or an earlier day." });
      if (existing.kind === "irp6" ? filedOn < existing.periodStart : filedOn <= existing.periodEnd) return refused({ filedOn: "That's before the period ended. Choose the day it was filed on eFiling." });
      if (!proofFileId || !(await deps.proofFiles.isProofOfSubmission(actor, proofFileId))) return refused({ proof: "Upload the proof of submission from eFiling (a PDF or a photo of it)." });
      const filed = await store.markFiled(id, { filedOn, filedAt: clock.now(), filedBy: actor.id, proofFileId, submissionReference });
      if (!filed) return refusedWith(reloadMessage);
      await record(actor, "tax.return-filed", { type: "tax-return", id }, `Recorded ${existing.label} as filed on ${filedOn}`, { proofFileId });
      const locked: string[] = [];
      const notLocked: string[] = [];
      if (locksOnFiling.includes(existing.kind)) {
        for (const month of monthsBetween(existing.periodStart, existing.periodEnd)) {
          if (await ledger.isLocked(month)) continue;
          const result = await ledger.lockPeriod(actor, month);
          (result.ok ? locked : notLocked).push(month);
        }
      }
      return done({ locked, notLocked });
    },

    /** The export pack: the return's figures and the journals behind them, as CSV. Needs finance:export as well. */
    async exportReturn(actor: Actor, id: string): Promise<{ fileName: string; csv: string } | null> {
      access.assertCan(actor, "tax:manage");
      access.assertCan(actor, "finance:export");
      const taxReturn = await store.taxReturn(id);
      if (!taxReturn) return null;
      const [journals, accounts] = await Promise.all([ledger.journals(actor, { from: taxReturn.periodStart, until: taxReturn.periodEnd }), ledger.accounts(actor)]);
      await record(actor, "tax.return-exported", { type: "tax-return", id }, `Exported ${taxReturn.label}`);
      return { fileName: exportFileName(taxReturn), csv: returnCsv(taxReturn, journals, accounts) };
    },

    /** For the print view: the return and the journals behind it. Read only. */
    async printPack(actor: Actor, id: string): Promise<{ taxReturn: TaxReturn; journalCount: number } | null> {
      access.assertCan(actor, "tax:manage");
      const taxReturn = await store.taxReturn(id);
      if (!taxReturn) return null;
      const journals = await ledger.journals(actor, { from: taxReturn.periodStart, until: taxReturn.periodEnd });
      const accounts = new Set(taxReturn.figures.accounts);
      return { taxReturn, journalCount: journals.filter((journal) => journal.lines.some((line) => accounts.has(line.accountCode))).length };
    },
  };
}

/** A registration without its sealed reference number. */
function withoutReference(record: RegistrationRecord): Registration {
  return {
    id: record.id,
    kind: record.kind,
    registered: record.registered,
    effectiveFrom: record.effectiveFrom,
    referenceLast4: record.referenceLast4,
    details: record.details,
    recordedAt: record.recordedAt,
    recordedBy: record.recordedBy,
  };
}

/** An IRP6 is prepared by its year's last month; its period ends earlier for the first payment, so the year end is found from the period start. */
function taxYearEndOf(taxReturn: Pick<TaxReturn, "periodStart">): IsoDate {
  return addDays(addMonths(taxReturn.periodStart, 12), -1);
}

export type TaxService = ReturnType<typeof createTaxService>;
