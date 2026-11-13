import { addDays, addMonths, daysBetween, isIsoDate, startOfIsoWeek, type IsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";

/**
 * The dates a report covers, both ends included and in the business's time
 * zone: 1 Nov to 30 Nov means the nights of 1 to 30 Nov, and arrivals,
 * departures and check-outs on any of those days. Stays keep their own
 * half-open nights ([arrive, leave)), so a stay leaving on 1 Nov has no
 * night in November.
 */
export type ReportRange = { from: IsoDate; until: IsoDate };

/** The longest a report may run: a year, leap day included, so a whole financial year always fits. */
export const maxRangeDays = 366;

/** How many days a range covers, both ends counted. */
export function rangeDays(range: ReportRange): number {
  return daysBetween(range.from, range.until) + 1;
}

/** Whether a range is two real dates, the right way round, and no longer than maxRangeDays. */
export function isReportRange(range: { from: unknown; until: unknown }): range is ReportRange {
  if (!isIsoDate(range.from) || !isIsoDate(range.until) || range.from > range.until) return false;
  return rangeDays({ from: range.from, until: range.until }) <= maxRangeDays;
}

export function inRange(date: IsoDate, range: ReportRange): boolean {
  return date >= range.from && date <= range.until;
}

const later = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const earlier = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

/** How many of a stay's nights fall in the range. */
export function nightsWithin(stay: Stay, range: ReportRange): number {
  const start = later(stay.arrive, range.from);
  const end = earlier(stay.leave, addDays(range.until, 1));
  return Math.max(0, daysBetween(start, end));
}

/** "2026-11" from "2026-11-13". */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

/**
 * A slice of a range: a calendar month or a week (Monday to Sunday), cut to
 * the range's ends. `whole` says the slice wasn't cut.
 */
export type RangePart = {
  /** The month ("2026-11") or the week's Monday ("2026-11-09"). */
  key: string;
  from: IsoDate;
  until: IsoDate;
  days: number;
  whole: boolean;
};

function partOf(key: string, start: IsoDate, end: IsoDate, range: ReportRange): RangePart {
  const from = later(start, range.from);
  const until = earlier(end, range.until);
  return { key, from, until, days: daysBetween(from, until) + 1, whole: from === start && until === end };
}

/** The calendar months a range touches, in order, each cut to the range. */
export function monthsOf(range: ReportRange): RangePart[] {
  const parts: RangePart[] = [];
  for (let start = `${monthOf(range.from)}-01`; start <= range.until; start = addMonths(start, 1)) {
    parts.push(partOf(monthOf(start), start, addDays(addMonths(start, 1), -1), range));
  }
  return parts;
}

/** The weeks (Monday to Sunday) a range touches, in order, each cut to the range. */
export function weeksOf(range: ReportRange): RangePart[] {
  const parts: RangePart[] = [];
  for (let monday = startOfIsoWeek(range.from); monday <= range.until; monday = addDays(monday, 7)) {
    parts.push(partOf(monday, monday, addDays(monday, 6), range));
  }
  return parts;
}
