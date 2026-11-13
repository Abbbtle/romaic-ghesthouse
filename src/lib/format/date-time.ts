import {
  compareIsoDates,
  isoWeekday,
  zonedParts,
  type IsoDate,
  type IsoWeekday,
  type LocalTime,
} from "@/lib/format/zoned-time";

/**
 * How dates and times read on the site: 24-hour times ("06:00"), dates as
 * words ("Tue 20 Oct", "Tuesday 20 October 2026"). Names are spelled out here
 * rather than taken from Intl, so the server and every browser print exactly
 * the same text (en-ZA's Intl output pads days and starts weeks on Sunday).
 */

export const weekdayNames: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const weekdayShortNames: Record<IsoWeekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The label for times on the site. Johannesburg has no daylight saving, so it's always SAST. */
export const businessTimeLabel = "SAST";

type DateParts = { year: number; month: number; day: number };

function partsOf(date: IsoDate): DateParts {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

/** "Tue 20 Oct" */
export function formatDayShort(date: IsoDate): string {
  const { month, day } = partsOf(date);
  return `${weekdayShortNames[isoWeekday(date)]} ${day} ${monthShortNames[month - 1]}`;
}

/** "Tuesday 20 October" */
export function formatDayMedium(date: IsoDate): string {
  const { month, day } = partsOf(date);
  return `${weekdayNames[isoWeekday(date)]} ${day} ${monthNames[month - 1]}`;
}

/** "Tuesday 20 October 2026" */
export function formatDayLong(date: IsoDate): string {
  return `${formatDayMedium(date)} ${partsOf(date).year}`;
}

/** "20 Oct" (no weekday or year), e.g. for messages that name the weekday separately. */
export function formatDayMonth(date: IsoDate): string {
  const { month, day } = partsOf(date);
  return `${day} ${monthShortNames[month - 1]}`;
}

/** "20 Oct 2026" */
export function formatDateShort(date: IsoDate): string {
  const { year, month, day } = partsOf(date);
  return `${day} ${monthShortNames[month - 1]} ${year}`;
}

/** "October 2026", from a month "2026-10". */
export function formatMonth(month: string): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return `${monthNames[number - 1]} ${year}`;
}

/** A span of months, sharing the year where it matches: "Oct 2026", "Oct – Dec 2026", "Dec 2026 – Feb 2027". */
export function formatMonthSpan(from: string, to: string): string {
  const [fromYear, fromMonth] = from.split("-").map(Number) as [number, number];
  const [toYear, toMonth] = to.split("-").map(Number) as [number, number];
  const first = monthShortNames[fromMonth - 1];
  const last = monthShortNames[toMonth - 1];
  if (from === to) return `${first} ${fromYear}`;
  return fromYear === toYear ? `${first} – ${last} ${toYear}` : `${first} ${fromYear} – ${last} ${toYear}`;
}

/**
 * A span of dates, sharing the month and year where they match:
 * "19–25 Oct 2026", "27 Oct – 2 Nov 2026", "28 Dec 2026 – 3 Jan 2027".
 */
export function formatDateSpan(from: IsoDate, to: IsoDate): string {
  if (compareIsoDates(from, to) === 0) return formatDateShort(from);
  const a = partsOf(from);
  const b = partsOf(to);
  if (a.year !== b.year) return `${formatDateShort(from)} – ${formatDateShort(to)}`;
  if (a.month !== b.month) return `${a.day} ${monthShortNames[a.month - 1]} – ${b.day} ${monthShortNames[b.month - 1]} ${b.year}`;
  return `${a.day}–${b.day} ${monthShortNames[b.month - 1]} ${b.year}`;
}

/** The wall-clock time of an instant in `timeZone`: "06:00". */
export function formatTime(instant: Date, timeZone: string): LocalTime {
  return zonedParts(instant, timeZone).time;
}

/** "06:00–07:00" (en dash, no spaces). */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`;
}

/** A machine-readable instant for <time dateTime>: "2026-10-20T04:00:00.000Z". */
export function machineInstant(instant: Date): string {
  return instant.toISOString();
}
