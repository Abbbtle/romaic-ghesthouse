import type { IsoDate } from "@/lib/format/zoned-time";
import type { Period } from "@/lib/ledger/journals";

/** Months of the books ("2026-11"), worked out without time zones: they're labels, not instants. */

const periodPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && periodPattern.test(value);
}

/** The month `count` months after `period` (before, if negative). */
export function shiftPeriod(period: Period, count: number): Period {
  const match = periodPattern.exec(period);
  if (!match) throw new RangeError(`Not a month: ${period}`);
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every month from `first` to `last`, newest first (nothing when `first` is later). */
export function monthsNewestFirst(first: Period, last: Period): Period[] {
  const months: Period[] = [];
  for (let month = last; month >= first; month = shiftPeriod(month, -1)) months.push(month);
  return months;
}

/** Whether a month is over by `today`, so it can be locked. */
export function monthHasEnded(period: Period, today: IsoDate): boolean {
  return period < today.slice(0, 7);
}

/** The earliest of the months given (ignoring any that aren't months). */
export function earliestPeriod(periods: readonly (Period | null | undefined)[]): Period | null {
  return periods.filter(isPeriod).reduce<Period | null>((earliest, period) => (earliest === null || period < earliest ? period : earliest), null);
}
