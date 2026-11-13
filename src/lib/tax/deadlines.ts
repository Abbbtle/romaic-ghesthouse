import { formatDateShort, formatDayShort } from "@/lib/format/date-time";
import type { IsoDate } from "@/lib/format/zoned-time";
import type { ReturnStatus } from "./returns";

/**
 * When a return is late, and how the tax pages say so. A return is late
 * once its due date has passed without it being recorded as filed here;
 * one due today isn't late until tomorrow.
 */

/** Whether something due on `dueOn` is late on `today`: the day has passed and it isn't filed. */
export function isLate(dueOn: IsoDate | null, status: ReturnStatus | null, today: IsoDate): boolean {
  return dueOn !== null && status !== "filed" && dueOn < today;
}

/** A due date in words: "Fri 6 Nov" in the current year, "31 Aug 2025" in any other. */
export function dueDayText(dueOn: IsoDate, today: IsoDate): string {
  return dueOn.slice(0, 4) === today.slice(0, 4) ? formatDayShort(dueOn) : formatDateShort(dueOn);
}

/** The overdue line: "Late: was due Fri 6 Nov". */
export function lateText(dueOn: IsoDate, today: IsoDate): string {
  return `Late: was due ${dueDayText(dueOn, today)}`;
}

/**
 * Due dates split for the overview: the late ones, most overdue first, and
 * those still to come (today on), soonest first. One whose day has passed
 * and that's filed is in neither: it's done.
 */
export function byDeadline<Item extends { dueOn: IsoDate; status: ReturnStatus | null }>(items: readonly Item[], today: IsoDate): { late: Item[]; comingUp: Item[] } {
  const sorted = [...items].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return {
    late: sorted.filter((item) => isLate(item.dueOn, item.status, today)),
    comingUp: sorted.filter((item) => item.dueOn >= today),
  };
}
