import { formatDayLong, formatMonth, weekdayShortNames } from "@/lib/format/date-time";
import { isoWeekday, isoWeekdays } from "@/lib/format/zoned-time";
import type { NightAvailability } from "@/lib/inventory/availability";
import { cx } from "@/components/ui/cx";

/** Nights grouped by month ("2026-12"), each month padded to start on a Monday. */
function monthsOf(nights: readonly NightAvailability[]): { month: string; cells: (NightAvailability | null)[] }[] {
  const months = new Map<string, NightAvailability[]>();
  for (const night of nights) {
    const month = night.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), night]);
  }
  return [...months.entries()].map(([month, monthNights]) => {
    const lead = isoWeekday(monthNights[0]!.date) - 1;
    const cells: (NightAvailability | null)[] = [...Array.from({ length: lead }, () => null), ...monthNights];
    while (cells.length % 7 !== 0) cells.push(null);
    return { month, cells };
  });
}

/**
 * An apartment's nights for the coming weeks: free nights as plain bold
 * numerals (nothing that looks pressable: the calendar is for reading),
 * booked nights struck through on a grey chip, and each night's state also in words for
 * screen readers, so it's never told by colour alone. Weeks start on Monday.
 * A night is booked only when every unit of the apartment is taken; the
 * calendar never says by whom or why.
 */
export function AvailabilityCalendar({ nights, className }: { nights: readonly NightAvailability[]; className?: string }) {
  const months = monthsOf(nights);
  return (
    <div className={cx("grid gap-6", className)}>
      <div className="grid gap-8 sm:grid-cols-2">
        {months.map(({ month, cells }) => (
          <table key={month} className="w-full table-fixed border-collapse text-center">
            <caption className="pb-3 text-left font-display text-title-sm font-normal text-ink">{formatMonth(month)}</caption>
            <thead>
              <tr>
                {isoWeekdays.map((day) => (
                  <th key={day} scope="col" className="pb-2 text-xs font-bold text-fg-3">
                    <abbr title={weekdayShortNames[day]} className="no-underline">
                      {weekdayShortNames[day].slice(0, 2)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, week) => (
                <tr key={week}>
                  {cells.slice(week * 7, week * 7 + 7).map((night, index) =>
                    night ? (
                      <td key={night.date} className="p-0.5">
                        <span
                          className={cx(
                            "flex aspect-square items-center justify-center rounded-xs text-sm tabular-nums",
                            night.status === "full" ? "bg-neutral-100 text-fg-3 line-through decoration-fg-3" : "font-bold text-ink",
                          )}
                        >
                          <span aria-hidden="true">{Number(night.date.slice(8))}</span>
                          <span className="sr-only">
                            {formatDayLong(night.date)}: {night.status === "full" ? "booked" : "free"}
                          </span>
                        </span>
                      </td>
                    ) : (
                      <td key={`empty-${week}-${index}`} aria-hidden="true" />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2" aria-label="Key">
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-flex size-5 items-center justify-center text-xs font-bold text-ink">
            8
          </span>
          Free
        </li>
        <li className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-xs bg-neutral-100 text-xs text-fg-3 line-through">
            8
          </span>
          Booked
        </li>
      </ul>
    </div>
  );
}
