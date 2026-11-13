import Link from "next/link";
import type { IsoDate } from "@/lib/format/zoned-time";
import type { ReportRange } from "@/lib/reports/report-range";
import type { Movements, Occupancy, OccupancyFigures, Throughput } from "@/lib/reports/reports";
import { adminRoutes } from "../admin-routes";
import { EmptyState } from "../empty-state";
import { BarList, ColumnChart, type BarRow } from "./charts";
import { ReportPanel, ReportSubheading } from "./report-frame";
import { formatCount, formatNights, formatRate, monthLabel, niceScale, rangeLabel, weekAxisLabel, weekLabel, weekPhrase } from "./report-model";

/** "120 of 186 nights booked · 4 closed · 2 for maintenance". */
function occupancyDetail(figures: OccupancyFigures): string {
  const parts = [`${formatCount(figures.soldNights)} of ${formatNights(figures.availableNights)} booked`];
  if (figures.closedNights > 0) parts.push(`${formatCount(figures.closedNights)} closed`);
  if (figures.maintenanceNights > 0) parts.push(`${formatCount(figures.maintenanceNights)} for maintenance`);
  return parts.join(" · ");
}

const meterRow = (key: string, label: string, figures: OccupancyFigures): BarRow => ({
  key,
  label,
  detail: occupancyDetail(figures),
  figure: formatRate(figures.rate),
  share: figures.rate,
});

/** Occupancy over the dates: by month when they span more than one, and by apartment type, as meters (each a share of its own nights open). */
export function OccupancyPanel({ occupancy, today, downloadHref }: { occupancy: Occupancy; today: IsoDate; downloadHref: string | null }) {
  const { heldNotSold, switchedOffNights } = occupancy;
  const notes = [
    occupancy.range.until > today && "Nights after today count the bookings made so far.",
    heldNotSold.channelNights > 0 &&
      `${formatNights(heldNotSold.channelNights)} held by channel stays not yet made into bookings ${heldNotSold.channelNights === 1 ? "counts" : "count"} as open, not booked, until they're completed as bookings.`,
    heldNotSold.requestNights > 0 &&
      `${formatNights(heldNotSold.requestNights)} held by booking requests waiting for an answer ${heldNotSold.requestNights === 1 ? "counts" : "count"} as open, not booked.`,
    switchedOffNights > 0 && `${formatNights(switchedOffNights)} booked in units that are switched off now ${switchedOffNights === 1 ? "is" : "are"} left out.`,
  ].filter((note): note is string => typeof note === "string");
  return (
    <ReportPanel kind="occupancy" downloadHref={downloadHref} notes={occupancy.activeUnits === 0 ? [] : notes}>
      {occupancy.activeUnits === 0 ? (
        <EmptyState
          frame="none"
          className="p-4 lg:p-5"
          title="No apartments are switched on"
          actions={
            <Link href={adminRoutes.apartments} className="text-sm font-bold text-link underline underline-offset-4">
              Open Apartments
            </Link>
          }
        >
          Occupancy counts the units that are switched on. Switch them on in Apartments.
        </EmptyState>
      ) : (
        <>
          {occupancy.months.length > 1 && (
            <>
              <ReportSubheading>By month</ReportSubheading>
              <BarList label="Occupancy by month" variant="meter" rows={occupancy.months.map((row) => meterRow(row.month.key, monthLabel(row.month), row))} />
            </>
          )}
          <ReportSubheading>By apartment</ReportSubheading>
          <BarList
            label="Occupancy by apartment"
            variant="meter"
            rows={occupancy.apartments.map((row) => meterRow(row.apartment, `${row.name} (${row.units} ${row.units === 1 ? "unit" : "units"})`, row))}
          />
        </>
      )}
    </ReportPanel>
  );
}

const headCell = "border-b border-hairline px-4 py-2.5 text-sm font-medium whitespace-nowrap text-fg-2 lg:px-5";
const rowHead = "px-4 py-2 text-left font-normal text-fg lg:px-5";
const numberCell = "px-4 py-2 text-right whitespace-nowrap tabular-nums lg:px-5";

/** Arrivals and departures by month, totals under a gold rule (structure only: the row is bold too). */
export function MovementsPanel({ movements, range, downloadHref }: { movements: Movements; range: ReportRange; downloadHref: string | null }) {
  return (
    <ReportPanel kind="arrivals-departures" downloadHref={downloadHref}>
      <div className="relative min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">Arrivals and departures, {rangeLabel(range)}</caption>
          <thead>
            <tr>
              <th scope="col" className={headCell}>
                Month
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Arrivals
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Departures
              </th>
            </tr>
          </thead>
          <tbody>
            {movements.months.length > 1 &&
              movements.months.map((row) => (
                <tr key={row.month.key}>
                  <th scope="row" className={rowHead}>
                    {monthLabel(row.month)}
                  </th>
                  <td className={numberCell}>{formatCount(row.arrivals)}</td>
                  <td className={numberCell}>{formatCount(row.departures)}</td>
                </tr>
              ))}
            <tr className={movements.months.length > 1 ? "border-t-2 border-romaic-gold font-bold text-ink" : "font-bold text-ink"}>
              <th scope="row" className={`${rowHead} font-bold`}>
                {movements.months.length > 1 ? "Total" : rangeLabel(range)}
              </th>
              <td className={numberCell}>{formatCount(movements.arrivals)}</td>
              <td className={numberCell}>{formatCount(movements.departures)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </ReportPanel>
  );
}

/** Cleans done per week as columns (when there's more than one week to compare), with the busiest week's figure on its cap. */
export function CleaningPanel({ cleaning, range, downloadHref }: { cleaning: Throughput; range: ReportRange; downloadHref: string | null }) {
  const { weeks, busiest } = cleaning;
  const scale = niceScale(busiest?.cleans ?? 0, { counts: true });
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 8));
  const phoneEvery = Math.max(1, Math.ceil(weeks.length / 4));
  const cleansLabel = (count: number) => `${formatCount(count)} ${count === 1 ? "clean" : "cleans"}`;
  const charted = cleaning.cleans > 0 && weeks.length > 1;
  const notes = charted && weeks.some((row) => !row.week.whole) ? ["Lighter columns are weeks the dates cut short, so they cover fewer than seven days."] : [];
  return (
    <ReportPanel kind="cleaning" downloadHref={downloadHref} notes={notes}>
      <div className="grid gap-4 p-4 lg:p-5">
        <p className="text-base text-fg">
          {cleaning.cleans === 0
            ? "No cleans were marked done in these dates."
            : `${cleansLabel(cleaning.cleans)} done${busiest && weeks.length > 1 ? `. The busiest week was ${weekPhrase(busiest.week)}, with ${formatCount(busiest.cleans)}.` : "."}`}
        </p>
        {charted && (
          <ColumnChart
            label={`Cleans done per week, ${rangeLabel(range)}`}
            top={scale.top}
            ticks={scale.ticks.map((value) => ({ value, label: formatCount(value) }))}
            highlight={busiest ? { key: busiest.week.key, label: formatCount(busiest.cleans) } : null}
            columns={weeks.map((row, index) => ({
              key: row.week.key,
              label: index % labelEvery === 0 ? weekAxisLabel(row.week) : null,
              labelOnPhone: index % phoneEvery === 0,
              title: `${weekLabel(row.week)}: ${cleansLabel(row.cleans)}`,
              value: row.cleans,
              partial: !row.week.whole,
            }))}
            table={{
              caption: `Cleans done per week, ${rangeLabel(range)}`,
              headings: ["Week", "Cleans done"],
              rows: weeks.map((row) => [weekLabel(row.week), formatCount(row.cleans)] as const),
            }}
          />
        )}
      </div>
    </ReportPanel>
  );
}
