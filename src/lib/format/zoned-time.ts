/**
 * Calendar maths in a business time zone, without depending on the time zone
 * of the server or the browser. Instants are JavaScript Dates (stored as UTC);
 * calendar dates and wall-clock times are plain strings. The business runs on
 * Africa/Johannesburg (UTC+2, no daylight saving), but nothing here assumes a
 * fixed offset, so daylight-saving zones work too.
 */

/** A calendar date, "2026-10-20". */
export type IsoDate = string;

/** A wall-clock time, "06:00" (24-hour, minutes precision). */
export type LocalTime = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. The diary's week starts on Monday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The business runs on Johannesburg time everywhere (SAST, UTC+2, no daylight saving). */
export const businessTimeZone = "Africa/Johannesburg";

export const isoWeekdays: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

const minuteMs = 60_000;
const dayMs = 86_400_000;
const minutesPerDay = 24 * 60;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const localTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const match = isoDatePattern.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === "string" && localTimePattern.test(value);
}

/** Minutes since midnight: "06:30" → 390. */
export function timeToMinutes(time: LocalTime): number {
  const match = localTimePattern.exec(time);
  if (!match) throw new RangeError(`Not a time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 390 → "06:30". Accepts 0–1439. */
export function minutesToTime(minutes: number): LocalTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= minutesPerDay) {
    throw new RangeError(`Not a time of day in minutes: ${minutes}`);
  }
  return `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`;
}

/** The date `days` after (or before, if negative) `date`. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMidnight(utcMidnight(date) + days * dayMs);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / dayMs);
}

/** Orders two dates: negative if `a` is earlier, 0 if equal, positive if later. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return utcMidnight(a) - utcMidnight(b);
}

export function isoWeekday(date: IsoDate): IsoWeekday {
  const day = new Date(utcMidnight(date)).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** The Monday of the week that contains `date`. */
export function startOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** What a clock in `timeZone` shows at `instant`. */
export type ZonedParts = {
  date: IsoDate;
  time: LocalTime;
  weekday: IsoWeekday;
  /** Minutes since local midnight. */
  minutesOfDay: number;
};

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const wall = new Date(wallClockMs(instant.getTime(), timeZone));
  const date = fromUtcMidnight(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
  const minutesOfDay = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  return { date, time: minutesToTime(minutesOfDay), weekday: isoWeekday(date), minutesOfDay };
}

/** Today's date in `timeZone`. */
export function zonedToday(now: Date, timeZone: string): IsoDate {
  return zonedParts(now, timeZone).date;
}

/**
 * The instant when a clock in `timeZone` reads `date` at `time`. When a
 * daylight-saving change makes a time happen twice, the earlier instant is
 * used; when it skips a time, the result is moved forward by the gap.
 */
export function zonedInstant(date: IsoDate, time: LocalTime, timeZone: string): Date {
  const [year, month, day] = dateParts(date);
  const minutes = timeToMinutes(time);
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // Real zones change offset at most once within a day either side.
  const offsetBefore = offsetMs(target - dayMs, timeZone);
  const offsetAfter = offsetMs(target + dayMs, timeZone);
  const candidates = [...new Set([target - offsetBefore, target - offsetAfter])].sort((a, b) => a - b);
  for (const candidate of candidates) {
    if (wallClockMs(candidate, timeZone) === target) return new Date(candidate);
  }
  return new Date(target - offsetBefore);
}

/** The instants that bound a calendar day in `timeZone`: [start, end). */
export function zonedDayBounds(date: IsoDate, timeZone: string): { start: Date; end: Date } {
  return { start: zonedInstant(date, "00:00", timeZone), end: zonedInstant(addDays(date, 1), "00:00", timeZone) };
}

/** Adds whole minutes to an instant. */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * minuteMs);
}

/**
 * The same day of the month `months` later (or earlier, if negative). A day
 * the target month doesn't have becomes its last day: 31 Mar + 1 → 30 Apr.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months)) throw new RangeError(`Not a whole number of months: ${months}`);
  const [year, month, day] = dateParts(date);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromUtcMidnight(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTarget)));
}

// --- internals -------------------------------------------------------------

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

function dateParts(date: IsoDate): [number, number, number] {
  const match = isoDatePattern.exec(date);
  if (!match || !isIsoDate(date)) throw new RangeError(`Not a date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function utcMidnight(date: IsoDate): number {
  const [year, month, day] = dateParts(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMidnight(ms: number): IsoDate {
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The local wall-clock reading at `instant`, expressed as if it were UTC milliseconds. */
function wallClockMs(instant: number, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const hour = read("hour") % 24;
  return Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"));
}

/** The zone's offset from UTC at `instant`, in milliseconds (Johannesburg: +2 h). */
function offsetMs(instant: number, timeZone: string): number {
  const wholeSeconds = Math.floor(instant / 1000) * 1000;
  return wallClockMs(wholeSeconds, timeZone) - wholeSeconds;
}
