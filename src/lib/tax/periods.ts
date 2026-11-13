import { addDays, addMonths, isoWeekday, type IsoDate } from "@/lib/format/zoned-time";
import type { MonthlyDue, ProvisionalPeriods, VatCategoryRule, VatReturnDue } from "./parameters";

/**
 * Tax periods and due dates, worked out from verified parameters. Business
 * days here skip weekends only: public holidays aren't known to the app, so
 * every due date it shows says to check the SARS calendar when one falls on
 * a public holiday.
 */

export const publicHolidayCaveat = "If a due date falls on a public holiday, it moves to the business day before.";

/** "2026-11". */
export type Month = string;

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

export function firstDayOf(month: Month): IsoDate {
  return `${month}-01`;
}

export function lastDayOf(month: Month): IsoDate {
  return addDays(addMonths(firstDayOf(month), 1), -1);
}

/** The months from `from` to `until`, inclusive. */
export function monthsBetween(from: IsoDate, until: IsoDate): Month[] {
  const months: Month[] = [];
  for (let month = monthOf(from); month <= monthOf(until); month = monthOf(addMonths(firstDayOf(month), 1))) months.push(month);
  return months;
}

export function isBusinessDay(date: IsoDate): boolean {
  return isoWeekday(date) <= 5;
}

/** The date itself if it's a business day, otherwise the business day before it. */
export function businessDayOnOrBefore(date: IsoDate): IsoDate {
  let day = date;
  while (!isBusinessDay(day)) day = addDays(day, -1);
  return day;
}

export function lastBusinessDayOf(month: Month): IsoDate {
  return businessDayOnOrBefore(lastDayOf(month));
}

/** The month after the one a date falls in. */
function nextMonth(date: IsoDate): Month {
  return monthOf(addMonths(firstDayOf(monthOf(date)), 1));
}

/** A VAT201's due dates for a period ending on `periodEnd`: the manual day, and the eFiling date when SARS gives one. */
export function vatReturnDue(rule: VatReturnDue, periodEnd: IsoDate): { manual: IsoDate; efiling: IsoDate | null } {
  const month = nextMonth(periodEnd);
  return {
    manual: businessDayOnOrBefore(`${month}-${String(rule.manualDay).padStart(2, "0")}`),
    efiling: rule.efilingLastBusinessDay ? lastBusinessDayOf(month) : null,
  };
}

/** An EMP201's due date for a month: so many days after it ends, or the business day before. */
export function emp201Due(rule: MonthlyDue, month: Month): IsoDate {
  return businessDayOnOrBefore(addDays(lastDayOf(month), rule.daysAfterMonthEnd));
}

/** The months a VAT category's periods end in, for a business whose year ends in `yearEndMonth`. */
export function vatEndMonths(rule: VatCategoryRule, yearEndMonth: number): number[] {
  return rule.endMonths === "year-end" ? [yearEndMonth] : rule.endMonths;
}

/** The VAT period ending in `endMonth` ("2027-02"), or null when the category has no period ending then. */
export function vatPeriodEnding(rule: VatCategoryRule, yearEndMonth: number, endMonth: Month): { start: IsoDate; end: IsoDate } | null {
  const monthNumber = Number(endMonth.slice(5, 7));
  if (!vatEndMonths(rule, yearEndMonth).includes(monthNumber)) return null;
  const end = lastDayOf(endMonth);
  return { start: addMonths(firstDayOf(endMonth), 1 - rule.months), end };
}

/** VAT periods that end from `from` to `until`, oldest first. */
export function vatPeriodsEndingBetween(rule: VatCategoryRule, yearEndMonth: number, from: IsoDate, until: IsoDate): { start: IsoDate; end: IsoDate }[] {
  return monthsBetween(from, until)
    .map((month) => vatPeriodEnding(rule, yearEndMonth, month))
    .filter((period): period is { start: IsoDate; end: IsoDate } => period !== null && period.end >= from && period.end <= until);
}

/** A year of assessment, from the month it ends in. */
export type TaxYear = { start: IsoDate; end: IsoDate };

/** The year (ending in `yearEndMonth`) that a date falls in. */
export function taxYearContaining(date: IsoDate, yearEndMonth: number): TaxYear {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const endYear = month > yearEndMonth ? year + 1 : year;
  const end = lastDayOf(`${endYear}-${String(yearEndMonth).padStart(2, "0")}`);
  return { start: addMonths(addDays(end, 1), -12), end };
}

export const provisionalPayments = ["first", "second"] as const;
export type ProvisionalPayment = (typeof provisionalPayments)[number];

/** The period a provisional payment covers (from the year's start) and when it's due. */
export function provisionalPeriod(rule: ProvisionalPeriods, year: TaxYear, payment: ProvisionalPayment): { start: IsoDate; end: IsoDate; due: IsoDate } {
  if (payment === "first") {
    const end = addDays(addMonths(year.start, rule.firstMonthsFromStart), -1);
    return { start: year.start, end, due: businessDayOnOrBefore(end) };
  }
  return { start: year.start, end: year.end, due: rule.secondLastBusinessDayOfYear ? lastBusinessDayOf(monthOf(year.end)) : year.end };
}

/** The voluntary third payment's due date: September's last business day for individuals and February companies, otherwise months after the year ends. */
export function provisionalThirdDue(rule: ProvisionalPeriods, year: TaxYear, isCompany: boolean): IsoDate {
  const februaryYear = year.end.slice(5, 7) === "02";
  if (!isCompany || februaryYear) {
    const month = `${year.end.slice(0, 4)}-${String(rule.thirdFebruaryYearEndMonth).padStart(2, "0")}`;
    return lastBusinessDayOf(month);
  }
  return businessDayOnOrBefore(lastDayOf(monthOf(addMonths(firstDayOf(monthOf(year.end)), rule.thirdOtherMonthsAfterEnd))));
}
