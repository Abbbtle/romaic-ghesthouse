import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { formatCents } from "@/lib/format/money";
import type { IsoDate } from "@/lib/format/zoned-time";
import { stayLabelInList } from "@/lib/inventory/stays";
import type { ReportRange } from "@/lib/reports/report-range";
import type { BalanceGroup, Balances, ChannelMix, ChannelRow, Revenue, RevenueFigures } from "@/lib/reports/reports";
import { adminRoutes } from "../admin-routes";
import { sourceName } from "../bookings/booking-labels";
import { EmptyState } from "../empty-state";
import { Bar, ColumnChart } from "./charts";
import { ReportPanel, ReportSubheading } from "./report-frame";
import { figureNames, formatAxisRands, formatCount, formatNights, monthLabel, monthShortLabel, niceScale, rangeLabel } from "./report-model";

// Totals sit under a 2 px Romaic Gold rule, as the books' statements do: structure only, the row is bold as well.
// Only under rows they add up: a lone row straight under the headings gets no rule.
const totalRule = "border-t-2 border-romaic-gold";

const centsOrNone = (cents: number | null) => (cents === null ? "None" : formatCents(cents));

/** "Average per night booked (ADR)", the trade name lighter, so the plain name leads. */
function FigureName({ name }: { name: string }) {
  const at = name.indexOf(" (");
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)} <span className="font-normal text-fg-3">{name.slice(at + 1)}</span>
    </>
  );
}

// --- money from stays and rates per night ------------------------------------------------

type RatesLine = { key: string; label: string; figures: RevenueFigures; bold: boolean; rule: boolean };

// From 640 px, a table. Its inner columns are 8 px a side (12 px from 768 px) and its headings wrap, so all six fit a 640 px screen.
const cellX = {
  first: "pl-4 pr-2 md:pr-3 lg:pl-5",
  inner: "px-2 md:px-3",
  last: "pl-2 pr-4 md:pl-3 lg:pr-5",
} as const;
const headCell = (at: keyof typeof cellX) => cx(cellX[at], "border-b border-hairline py-2.5 align-bottom text-sm font-medium text-fg-2", at === "first" ? "whitespace-nowrap" : "text-right");
const numberCell = (at: keyof typeof cellX) => cx(cellX[at], "py-2 text-right align-top whitespace-nowrap tabular-nums");

function RatesTable({ lines, caption }: { lines: readonly RatesLine[]; caption: string }) {
  return (
    <div className="relative hidden min-w-0 overflow-x-auto sm:block">
      <table className="w-full border-collapse text-left text-base">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={headCell("first")}>
              Month
            </th>
            <th scope="col" className={headCell("inner")}>
              {figureNames.revenue}
            </th>
            <th scope="col" className={headCell("inner")}>
              Stays
            </th>
            <th scope="col" className={headCell("inner")}>
              Nights
            </th>
            <th scope="col" className={headCell("inner")}>
              <FigureName name={figureNames.adr} />
            </th>
            <th scope="col" className={headCell("last")}>
              <FigureName name={figureNames.revpar} />
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className={cx(line.rule ? totalRule : "border-b border-hairline last:border-b-0", line.bold && "font-bold text-ink")}>
              <th scope="row" className={cx(cellX.first, "py-2 text-left align-top whitespace-nowrap", line.bold ? "font-bold" : "font-normal text-fg")}>
                {line.label}
              </th>
              <td className={numberCell("inner")}>{formatCents(line.figures.revenueCents)}</td>
              <td className={numberCell("inner")}>{formatCount(line.figures.stays)}</td>
              <td className={numberCell("inner")}>{formatCount(line.figures.nights)}</td>
              <td className={numberCell("inner")}>{centsOrNone(line.figures.adrCents)}</td>
              <td className={numberCell("last")}>{centsOrNone(line.figures.revparCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One figure on a phone ledger: its name on the left, the figure right-aligned in tabular figures. */
function LedgerLine({ name, value, bold }: { name: ReactNode; value: string; bold: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <dt className="min-w-0 text-sm text-fg-2">{name}</dt>
      <dd className={cx("whitespace-nowrap tabular-nums", bold ? "font-bold text-ink" : "text-fg")}>{value}</dd>
    </div>
  );
}

/** Below 640 px, each month as ledger rows, so every figure shows on a phone without scrolling sideways. */
function RatesLedger({ lines }: { lines: readonly RatesLine[] }) {
  return (
    <div className="sm:hidden">
      {lines.map((line, index) => (
        <div key={line.key} className={cx("px-4 py-3", index > 0 && (line.rule ? totalRule : "border-t border-hairline"))}>
          <h4 className="font-bold text-ink">{line.label}</h4>
          <dl className="mt-1">
            <LedgerLine name={figureNames.revenue} value={formatCents(line.figures.revenueCents)} bold={line.bold} />
            <LedgerLine name="Stays · nights" value={`${formatCount(line.figures.stays)} · ${formatCount(line.figures.nights)}`} bold={line.bold} />
            <LedgerLine name={<FigureName name={figureNames.adr} />} value={centsOrNone(line.figures.adrCents)} bold={line.bold} />
            <LedgerLine name={<FigureName name={figureNames.revpar} />} value={centsOrNone(line.figures.revparCents)} bold={line.bold} />
          </dl>
        </div>
      ))}
    </div>
  );
}

/** Money from stays by month as columns (when there's more than one month), and the rates per night under it: a table from 640 px, ledger rows on phones. */
export function RatesPanel({ revenue, range, today, downloadHref }: { revenue: Revenue; range: ReportRange; today: IsoDate; downloadHref: string | null }) {
  const months = revenue.months;
  const byMonth = months.length > 1;
  const best = months.reduce<(typeof months)[number] | null>((top, month) => (month.revenueCents > (top?.revenueCents ?? 0) ? month : top), null);
  const scale = niceScale(best?.revenueCents ?? 0);
  const lines: RatesLine[] = [
    ...(byMonth ? months.map((row) => ({ key: row.month.key, label: monthLabel(row.month), figures: row, bold: false, rule: false })) : []),
    { key: "total", label: byMonth ? "Total" : rangeLabel(range), figures: revenue.total, bold: true, rule: byMonth },
  ];
  const notes = [
    byMonth && best && months.some((row) => !row.month.whole) && "Lighter columns are months the dates cut short.",
    range.until > today && "These dates run past today: only stays already checked out count, so later days show no money from stays yet.",
  ].filter((note): note is string => typeof note === "string");
  return (
    <ReportPanel
      kind="rates"
      downloadHref={downloadHref}
      notes={notes}
      counting={["Each stay counts on the day it checked out, so a stay over the end of a month counts in the month it ended."]}
    >
      {byMonth && best && (
        <div className="border-b border-hairline p-4 lg:p-5">
          <ColumnChart
            label={`${figureNames.revenue} by month, ${rangeLabel(range)}`}
            top={scale.top}
            ticks={scale.ticks.map((value) => ({ value, label: formatAxisRands(value) }))}
            highlight={{ key: best.month.key, label: formatAxisRands(best.revenueCents) }}
            columns={months.map((row, index) => ({
              key: row.month.key,
              label: monthShortLabel(row.month),
              labelOnPhone: months.length <= 6 || index % 2 === 0,
              title: `${monthLabel(row.month)}: ${formatCents(row.revenueCents)}`,
              value: row.revenueCents,
              partial: !row.month.whole,
            }))}
            table={{
              caption: `${figureNames.revenue} by month, ${rangeLabel(range)}`,
              headings: ["Month", figureNames.revenue],
              rows: months.map((row) => [monthLabel(row.month), formatCents(row.revenueCents)] as const),
            }}
          />
        </div>
      )}
      <RatesTable lines={lines} caption={`${figureNames.revenue} and rates per night, ${rangeLabel(range)}`} />
      <RatesLedger lines={lines} />
    </ReportPanel>
  );
}

// --- by channel ----------------------------------------------------------------------------

/** What a commission line that isn't a booking source stands for. */
const channelRowDetail: Record<Exclude<ChannelRow["kind"], "source">, string> = {
  "other-channels": "Taken off the payout of a channel without its own account",
  untied: "Paid from the bank, in cash or by the owner, or posted by hand",
};

/** On phones, one column (the amounts as ledger rows); from 640 px, three columns under a header row. */
const channelGrid = "grid gap-x-4 gap-y-1 px-4 sm:grid-cols-[minmax(0,1fr)_8rem_13rem] sm:items-start lg:px-5";

/** An amount on a channel's row: named on the left on phones; from 640 px, right-aligned under its column's heading (named for screen readers). */
function ChannelAmount({ name, cents }: { name: string; cents: number | null }) {
  if (cents === null) return <span aria-hidden="true" className="hidden sm:block" />;
  return (
    <div className="flex items-baseline justify-between gap-4 sm:block sm:text-right">
      <span className="text-sm font-normal text-fg-2 sm:sr-only">{name}</span>
      <span className="whitespace-nowrap tabular-nums">{formatCents(cents)}</span>
    </div>
  );
}

/** Money from stays and commission by where bookings came from, largest first, each source with a meter of its share of the money from stays. */
export function ChannelsPanel({ channels, range, downloadHref }: { channels: ChannelMix; range: ReportRange; downloadHref: string | null }) {
  const whole = channels.revenueCents;
  return (
    <ReportPanel
      kind="channels"
      downloadHref={downloadHref}
      counting={["Commission counts on the date of its entry in the books, which can be a month or more after the stays it was for."]}
    >
      {channels.rows.length === 0 ? (
        <p className="p-4 text-base text-fg-2 lg:p-5">No stays checked out and no commission in these dates.</p>
      ) : (
        <>
          <div aria-hidden="true" className={cx(channelGrid, "hidden border-b border-hairline py-2.5 text-sm font-medium text-fg-2 sm:grid")}>
            <span>Where from</span>
            <span className="text-right">{figureNames.revenue}</span>
            <span className="text-right">{figureNames.commission}</span>
          </div>
          <ul aria-label={`${figureNames.revenue} and ${figureNames.commission.toLowerCase()}, by channel, ${rangeLabel(range)}`} className="divide-y divide-hairline">
            {channels.rows.map((row) => (
              <li key={row.key ?? row.kind} className={cx(channelGrid, "py-3")}>
                <div className="min-w-0">
                  <span className="block font-medium text-ink">{row.name}</span>
                  <span className="block text-sm text-fg-3">
                    {row.kind === "source" ? `${formatCount(row.stays)} ${row.stays === 1 ? "stay" : "stays"} · ${formatNights(row.nights)}` : channelRowDetail[row.kind]}
                  </span>
                </div>
                {row.kind === "source" && whole > 0 && (
                  // Its share of all the money from stays, on a track the row's full width: one channel alone fills it.
                  <div className="py-1 sm:order-last sm:col-span-3 sm:pt-1.5 sm:pb-0">
                    <Bar share={row.revenueCents / whole} variant="meter" height={6} />
                  </div>
                )}
                <ChannelAmount name={figureNames.revenue} cents={row.kind === "source" ? row.revenueCents : null} />
                <ChannelAmount name={figureNames.commission} cents={row.commissionCents} />
              </li>
            ))}
          </ul>
          <div className={cx(channelGrid, totalRule, "py-3 font-bold text-ink")}>
            <span>Total</span>
            <ChannelAmount name={figureNames.revenue} cents={channels.revenueCents} />
            <ChannelAmount name={figureNames.commission} cents={channels.commissionCents} />
          </div>
        </>
      )}
    </ReportPanel>
  );
}

// --- still to pay --------------------------------------------------------------------------

const groupTitles: Record<BalanceGroup, string> = {
  "checked-out": "Checked out, still owing",
  "checked-in": "In the house",
  confirmed: "Not checked in yet",
};

const moneyHref = (bookingId: string) => `${adminRoutes.bookings}/${encodeURIComponent(bookingId)}/money`;

/** Who still owes money, grouped by where the stay is, each opening its booking's money page; the total under a gold rule. */
export function BalancesPanel({ balances, asOf, downloadHref }: { balances: Balances; asOf: IsoDate; downloadHref: string | null }) {
  return (
    <ReportPanel kind="still-to-pay" downloadHref={balances.rows.length > 0 ? downloadHref : null}>
      {balances.rows.length === 0 ? (
        <EmptyState frame="none" className="p-4 lg:p-5" title="Nothing is owed">
          Every booking that holds its nights is paid up.
        </EmptyState>
      ) : (
        <>
          {balances.groups.map((group) => (
            <section key={group.status} aria-label={groupTitles[group.status]}>
              <ReportSubheading>
                {groupTitles[group.status]} ({formatCount(group.rows.length)})
              </ReportSubheading>
              <ul className="divide-y divide-hairline">
                {group.rows.map((row) => (
                  <li key={row.bookingId}>
                    <Link
                      href={moneyHref(row.bookingId)}
                      className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors duration-150 -outline-offset-2 hover:bg-chalk lg:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-link">
                          {row.guestName} <span className="font-normal text-fg-3 tabular-nums">{row.ref}</span>
                        </span>
                        <span className="block text-sm text-fg-2">{stayLabelInList(row.stay, asOf)}</span>
                        <span className="block text-sm text-fg-3">{sourceName(row.channel)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold text-ink tabular-nums">{formatCents(row.balanceCents)}</span>
                        <span className="block text-sm text-fg-3 tabular-nums">of {formatCents(row.totalCents)}</span>
                      </span>
                      <ChevronRight aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-fg-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className={cx(totalRule, "flex items-baseline justify-between gap-4 px-4 py-3 font-bold text-ink lg:px-5")}>
            <span>Still to pay in all</span>
            <span className="text-h4 tabular-nums">{formatCents(balances.totalCents)}</span>
          </div>
        </>
      )}
    </ReportPanel>
  );
}
