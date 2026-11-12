import { formatDateShort, formatDayShort, formatTime } from "@/lib/format/date-time";
import { daysBetween, zonedParts } from "@/lib/format/zoned-time";

/**
 * When something happened, the way the dashboard says it, in the business's
 * time zone: "today at 14:02", "yesterday at 09:15", "Tue 20 Oct" within the
 * year, "20 Oct 2025" before it. Pages work it out on the server, which
 * knows the time, so the browser shows the same words.
 */
export function whenLabel(instant: Date, now: Date, timeZone: string): string {
  const then = zonedParts(instant, timeZone);
  const today = zonedParts(now, timeZone).date;
  const daysAgo = daysBetween(then.date, today);
  if (daysAgo === 0) return `today at ${formatTime(instant, timeZone)}`;
  if (daysAgo === 1) return `yesterday at ${formatTime(instant, timeZone)}`;
  return then.date.slice(0, 4) === today.slice(0, 4) ? formatDayShort(then.date) : formatDateShort(then.date);
}

/** The same with a capital, to start a line: "Today at 14:02". */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
