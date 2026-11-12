import { formatDateShort } from "@/lib/format/date-time";
import { addDays, addMonths, type IsoDate } from "@/lib/format/zoned-time";
import { lookUp, type TaxParameter } from "./parameters";
import { emp201Due, firstDayOf, lastDayOf, monthOf, monthsBetween, provisionalPeriod, provisionalThirdDue, taxYearContaining, vatPeriodsEndingBetween, vatReturnDue, type ProvisionalPayment } from "./periods";
import { registeredOn, type RegistrationSet } from "./registrations";
import { returnLabel, type ReturnKind, type ReturnStatus, type TaxReturn } from "./returns";

/**
 * The filing calendar: what's due soon, worked out only from verified
 * parameters and the registrations the owner has recorded. Where a
 * registered tax needs a parameter that isn't verified, the calendar says
 * so instead of guessing a date.
 */

export type CalendarItem = {
  kind: ReturnKind;
  label: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** The date to have it in by (eFiling, where SARS gives two). */
  dueOn: IsoDate;
  /** The date for a return not filed on eFiling, where SARS gives two (the 25th for a VAT201). */
  manualDueOn: IsoDate | null;
  /** The month to pick when preparing it. */
  month: string;
  payment?: ProvisionalPayment;
  /** The return already prepared for it, if any. */
  returnId: string | null;
  status: ReturnStatus | null;
};

export type FilingCalendar = { items: CalendarItem[]; gaps: string[] };

/** How far back and ahead the calendar looks, by due date. */
const lookBackDays = 31;
const lookAheadDays = 120;

export function filingCalendar(input: {
  today: IsoDate;
  parameters: readonly TaxParameter[];
  registrations: RegistrationSet;
  yearEndMonth: number;
  returns: readonly TaxReturn[];
}): FilingCalendar {
  const { today, parameters, registrations, yearEndMonth } = input;
  const from = addDays(today, -lookBackDays);
  const until = addDays(today, lookAheadDays);
  const items: CalendarItem[] = [];
  const gaps: string[] = [];
  const existing = (kind: ReturnKind, start: IsoDate, end: IsoDate) => input.returns.find((candidate) => candidate.kind === kind && candidate.periodStart === start && candidate.periodEnd === end) ?? null;
  const push = (item: Omit<CalendarItem, "returnId" | "status">) => {
    if (item.dueOn < from || item.dueOn > until) return;
    const found = existing(item.kind, item.periodStart, item.periodEnd);
    items.push({ ...item, returnId: found?.id ?? null, status: found?.status ?? null });
  };

  const vat = registrations.vat;
  if (vat?.registered && registeredOn(registrations, "vat", today) && vat.details.vatCategory) {
    const categories = lookUp(parameters, "vat.filing-categories", today);
    const due = lookUp(parameters, "vat.return-due", today);
    if (categories.status === "missing") gaps.push(categories.message);
    if (due.status === "missing") gaps.push(due.message);
    if (categories.status === "verified" && due.status === "verified") {
      for (const period of vatPeriodsEndingBetween(categories.value[vat.details.vatCategory], yearEndMonth, addMonths(from, -2), until)) {
        if (vat.effectiveFrom && period.end < vat.effectiveFrom) continue;
        const dates = vatReturnDue(due.value, period.end);
        push({
          kind: "vat201",
          label: returnLabel("vat201", period.start, period.end),
          periodStart: period.start,
          periodEnd: period.end,
          dueOn: dates.efiling ?? dates.manual,
          manualDueOn: dates.efiling ? dates.manual : null,
          month: monthOf(period.end),
        });
      }
    }
  }

  if (registeredOn(registrations, "paye", today)) {
    const due = lookUp(parameters, "paye.emp201-due", today);
    if (due.status === "missing") gaps.push(due.message);
    else {
      for (const month of monthsBetween(addMonths(from, -1), until)) {
        const start = firstDayOf(month);
        if (registrations.paye?.effectiveFrom && lastDayOf(month) < registrations.paye.effectiveFrom) continue;
        push({ kind: "emp201", label: returnLabel("emp201", start, lastDayOf(month)), periodStart: start, periodEnd: lastDayOf(month), dueOn: emp201Due(due.value, month), manualDueOn: null, month });
      }
    }
  }

  if (registeredOn(registrations, "income-tax", today)) {
    const periods = lookUp(parameters, "provisional.periods", today);
    if (periods.status === "missing") gaps.push(periods.message);
    else {
      const isCompany = registrations["income-tax"]?.details.legalForm !== "sole-proprietor";
      const thisYear = taxYearContaining(today, yearEndMonth);
      const lastYear = taxYearContaining(addDays(thisYear.start, -1), yearEndMonth);
      const nextYear = taxYearContaining(addDays(thisYear.end, 1), yearEndMonth);
      for (const year of [lastYear, thisYear, nextYear]) {
        for (const payment of ["first", "second"] as const) {
          const period = provisionalPeriod(periods.value, year, payment);
          push({ kind: "irp6", label: returnLabel("irp6", period.start, period.end, payment), periodStart: period.start, periodEnd: period.end, dueOn: period.due, manualDueOn: null, month: monthOf(year.end), payment });
        }
      }
      const third = provisionalThirdDue(periods.value, lastYear, isCompany);
      if (third >= from && third <= until) {
        gaps.push(`A voluntary third provisional payment for the year to ${formatDateShort(lastYear.end)} can be made by ${formatDateShort(third)}, if your accountant advises it.`);
      }
    }
  }

  if (registeredOn(registrations, "turnover", today)) {
    const interim = lookUp(parameters, "turnover.interim-payments", today);
    if (interim.status === "missing") gaps.push(`Turnover tax interim payment dates aren't shown: ${interim.message}`);
  }

  // A return prepared here and not filed stays on the calendar once it's late, however long ago it was due.
  for (const taxReturn of input.returns) {
    if (taxReturn.status === "filed" || taxReturn.dueOn === null || taxReturn.dueOn >= today) continue;
    if (items.some((item) => item.returnId === taxReturn.id)) continue;
    const yearEnd = taxReturn.kind === "irp6" ? addDays(addMonths(taxReturn.periodStart, 12), -1) : taxReturn.periodEnd;
    items.push({
      kind: taxReturn.kind,
      label: taxReturn.label,
      periodStart: taxReturn.periodStart,
      periodEnd: taxReturn.periodEnd,
      dueOn: taxReturn.dueOn,
      manualDueOn: null,
      month: monthOf(yearEnd),
      payment: taxReturn.figures.payment,
      returnId: taxReturn.id,
      status: taxReturn.status,
    });
  }

  items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.kind.localeCompare(b.kind));
  return { items, gaps: [...new Set(gaps)] };
}

/** How near the business is to having to register for VAT. */
export type VatWatch = {
  from: IsoDate;
  until: IsoDate;
  suppliesCents: number;
  threshold: { status: "verified"; cents: number; parameter: TaxParameter } | { status: "missing"; message: string };
  /** At or above this share of the threshold counts as near: the app's own warning level, not a SARS figure. */
  nearShare: number;
  level: "clear" | "near" | "over" | "unknown";
};

export const vatWatchNearShare = 0.8;

/** The last 12 months of income against the verified compulsory threshold. */
export function vatWatch(parameters: readonly TaxParameter[], today: IsoDate, suppliesCents: number): VatWatch {
  const from = addDays(addMonths(today, -12), 1);
  const lookup = lookUp(parameters, "vat.compulsory-threshold", today);
  if (lookup.status === "missing") return { from, until: today, suppliesCents, threshold: { status: "missing", message: lookup.message }, nearShare: vatWatchNearShare, level: "unknown" };
  const level = suppliesCents > lookup.value ? "over" : suppliesCents >= lookup.value * vatWatchNearShare ? "near" : "clear";
  return { from, until: today, suppliesCents, threshold: { status: "verified", cents: lookup.value, parameter: lookup.parameter }, nearShare: vatWatchNearShare, level };
}
