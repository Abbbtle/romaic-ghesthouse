import { formatDayShort } from "@/lib/format/date-time";
import { addDays, compareIsoDates, daysBetween, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";

/**
 * A stay: the nights from the arrival day up to, not including, the leaving
 * day, so [arrive, leave). Two stays clash when they share a night; one that
 * leaves on the day another arrives doesn't clash with it. Calendar days in
 * the business's time zone, with no times attached.
 */
export type Stay = { arrive: IsoDate; leave: IsoDate };

/** How far ahead, and for how long, a guest may ask for a stay on the site. */
export const stayLimits = {
  /** The longest stay the Book page takes in one request; longer stays are a conversation. */
  maxNights: 30,
  /** How far ahead the arrival day may be. */
  maxDaysAhead: 540,
} as const;

/** How many nights a stay is. */
export function nightsOf(stay: Stay): number {
  return daysBetween(stay.arrive, stay.leave);
}

/** Whether two stays share a night. */
export function staysOverlap(a: Stay, b: Stay): boolean {
  return compareIsoDates(a.arrive, b.leave) < 0 && compareIsoDates(b.arrive, a.leave) < 0;
}

/** Each night of a stay, by its date. */
export function nightsIn(stay: Stay): IsoDate[] {
  const nights: IsoDate[] = [];
  for (let night = stay.arrive; compareIsoDates(night, stay.leave) < 0; night = addDays(night, 1)) nights.push(night);
  return nights;
}

/** "2 nights" */
export function nightsLabel(stay: Stay): string {
  const nights = nightsOf(stay);
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** "Tue 20 Oct to Thu 22 Oct 2026, 2 nights": arrival and leaving days, as guests think of a stay. */
export function stayLabel(stay: Stay): string {
  return `${formatDayShort(stay.arrive)} to ${formatDayShort(stay.leave)} ${stay.leave.slice(0, 4)}, ${nightsLabel(stay)}`;
}

/** "Thu 12 Nov to Sat 14 Nov · 2 nights": for lists, with the year only when it isn't `thisYear`'s. */
export function stayLabelInList(stay: Stay, today: IsoDate): string {
  const year = stay.leave.slice(0, 4);
  return `${formatDayShort(stay.arrive)} to ${formatDayShort(stay.leave)}${year === today.slice(0, 4) ? "" : ` ${year}`} · ${nightsLabel(stay)}`;
}

export type StayProblem = { field: "arrive" | "leave"; message: string };

/**
 * What's wrong with a stay a guest asked for, given today's date in the
 * business's time zone, or null when it can be asked for. Arriving today is
 * fine; arriving yesterday isn't.
 */
export function stayProblem(stay: { arrive: unknown; leave: unknown }, today: IsoDate): StayProblem | null {
  if (!isIsoDate(stay.arrive)) return { field: "arrive", message: "Choose the day you arrive." };
  if (!isIsoDate(stay.leave)) return { field: "leave", message: "Choose the day you leave." };
  if (compareIsoDates(stay.arrive, today) < 0) return { field: "arrive", message: "Choose an arrival day from today onwards." };
  if (compareIsoDates(stay.leave, stay.arrive) <= 0) return { field: "leave", message: "Choose a leaving day after the arrival day." };
  if (daysBetween(today, stay.arrive) > stayLimits.maxDaysAhead) {
    return { field: "arrive", message: "We take requests up to 18 months ahead. For a later stay, WhatsApp or call us." };
  }
  if (nightsOf({ arrive: stay.arrive, leave: stay.leave }) > stayLimits.maxNights) {
    return { field: "leave", message: `For stays of more than ${stayLimits.maxNights} nights, WhatsApp or call us and we'll arrange it.` };
  }
  return null;
}
