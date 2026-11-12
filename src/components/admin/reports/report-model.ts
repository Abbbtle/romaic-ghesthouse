import type { DashboardRequirement } from "@/lib/accounts/access";
import type { CsvValue } from "@/lib/format/csv";
import { formatDateShort, formatDateSpan, formatDayMonth, formatMonth, formatMonthSpan } from "@/lib/format/date-time";
import { addDays, addMonths, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import { formatCents } from "@/lib/format/money";
import { financialYearStart } from "@/lib/ledger/reports";
import { isReportRange, maxRangeDays, type RangePart, type ReportRange } from "@/lib/reports/report-range";
import type { Balances, ChannelMix, Movements, Occupancy, Revenue, Throughput } from "@/lib/reports/reports";
import { bookingStatusNames } from "@/lib/reservations/reservations";
import { adminRoutes } from "../admin-routes";
import { sourceName } from "../bookings/booking-labels";
import { centsAsDecimal } from "../books/report-model";

/**
 * The Reports pages' shared model: which dates a page's address asks for,
 * the presets, where each report and download lives, the one plain line
 * under each report and the full account of what it counts and from where,
 * the figures' names, and each report as spreadsheet rows. The screen and
 * the CSV read the same figures under the same names.
 */

export const reportsPath = adminRoutes.reports;
export const revenuePath = `${adminRoutes.reports}/revenue`;

/** What the default dates and the presets are worked out from: today, and the month the financial year ends (1–12). */
export type ReportContext = { today: IsoDate; yearEndMonth: number };

const firstOfMonth = (date: IsoDate) => `${date.slice(0, 7)}-01`;
const lastOfMonth = (date: IsoDate) => addDays(addMonths(firstOfMonth(date), 1), -1);

/** The whole of this month: bookings later in the month count, so it's more than "so far". */
export function defaultRange(context: ReportContext): ReportRange {
  return { from: firstOfMonth(context.today), until: lastOfMonth(context.today) };
}

const firstValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const dayOf = (value: unknown): IsoDate | null => {
  const text = firstValue(value);
  return isIsoDate(text) ? text : null;
};

/**
 * The dates a page's address asks for (?from=&until=), with anything
 * missing or unreadable replaced by this month, dates given the wrong way
 * round swapped, and a span past a year cut to one. `corrected` says
 * something given couldn't be used as it was.
 */
export function rangeQueryFrom(input: Record<string, unknown>, context: ReportContext): { range: ReportRange; corrected: boolean } {
  const asked = { from: input.from !== undefined, until: input.until !== undefined };
  let from = dayOf(input.from);
  let until = dayOf(input.until);
  if (from === null || until === null) return { range: defaultRange(context), corrected: asked.from || asked.until };
  let corrected = false;
  if (from > until) {
    [from, until] = [until, from];
    corrected = true;
  }
  const last = addDays(from, maxRangeDays - 1);
  if (until > last) {
    until = last;
    corrected = true;
  }
  return { range: { from, until }, corrected };
}

/** The dates a download link asks for: this month when none are given, null when they can't be used as they are. */
export function parseRangeQuery(input: Record<string, unknown>, context: ReportContext): ReportRange | null {
  if (input.from === undefined && input.until === undefined) return defaultRange(context);
  const range = { from: input.from, until: input.until };
  return isReportRange(range) ? range : null;
}

export function rangeSearch(range: ReportRange): string {
  return new URLSearchParams({ from: range.from, until: range.until }).toString();
}

export function operationsHref(range: ReportRange): string {
  return `${reportsPath}?${rangeSearch(range)}`;
}

export function revenueHref(range: ReportRange): string {
  return `${revenuePath}?${rangeSearch(range)}`;
}

/** "November 2026" for a whole month; otherwise "1 Mar – 13 Nov 2026". */
export function rangeLabel(range: ReportRange): string {
  if (range.from === firstOfMonth(range.from) && range.until === lastOfMonth(range.from)) return formatMonth(range.from.slice(0, 7));
  if (range.from === firstOfMonth(range.from) && range.until === lastOfMonth(range.until)) return formatMonthSpan(range.from.slice(0, 7), range.until.slice(0, 7));
  return formatDateSpan(range.from, range.until);
}

export type RangePreset = { label: string; range: ReportRange };

/** The dates people most often want: whole months around today, and the financial year from the books' settings. */
export function rangePresets(context: ReportContext): RangePreset[] {
  const month = firstOfMonth(context.today);
  const yearStart = financialYearStart(context.today, context.yearEndMonth);
  const lastYearEnd = addDays(yearStart, -1);
  return [
    { label: "This month", range: { from: month, until: lastOfMonth(month) } },
    { label: "Last month", range: { from: addMonths(month, -1), until: addDays(month, -1) } },
    { label: "Next month", range: { from: addMonths(month, 1), until: lastOfMonth(addMonths(month, 1)) } },
    { label: "This financial year so far", range: { from: yearStart, until: context.today } },
    { label: "Last financial year", range: { from: financialYearStart(lastYearEnd, context.yearEndMonth), until: lastYearEnd } },
  ];
}

export function sameRange(a: ReportRange, b: ReportRange): boolean {
  return a.from === b.from && a.until === b.until;
}

// --- the reports and their downloads -----------------------------------------------------

export const reportKinds = ["occupancy", "arrivals-departures", "cleaning", "rates", "channels", "still-to-pay"] as const;
export type ReportKind = (typeof reportKinds)[number];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (reportKinds as readonly string[]).includes(value);
}

/** Operations reports carry no money; revenue reports are the owner's. */
export function isRevenueReport(kind: ReportKind): boolean {
  return kind === "rates" || kind === "channels" || kind === "still-to-pay";
}

/**
 * Who may download a report: operations ones whoever sees them
 * (reports:operations: the owner and sales); revenue ones only someone who
 * may take money figures out of the dashboard (finance:export: the owner),
 * having confirmed their password and code in the last 15 minutes.
 */
export function downloadRequirement(kind: ReportKind): DashboardRequirement {
  return isRevenueReport(kind) ? { permission: "finance:export", stepUp: true } : { permission: "reports:operations" };
}

export const reportTitles: Record<ReportKind, string> = {
  occupancy: "Occupancy",
  "arrivals-departures": "Arrivals and departures",
  cleaning: "Cleaning",
  rates: "Money from stays and rates per night",
  channels: "Money from stays and commission by channel",
  "still-to-pay": "Still to pay",
};

/**
 * The money figures' names, the same on the screen, in the charts' tables
 * and in the spreadsheets. ADR and RevPAR keep their trade names in
 * brackets, for the owner's accountant and the channels' extranets.
 */
export const figureNames = {
  revenue: "Money from stays",
  commission: "Commission paid to channels",
  adr: "Average per night booked (ADR)",
  revpar: "Earned per night open (RevPAR)",
} as const;

/** The one plain line under each report's title: what it shows. */
export const reportSummaries: Record<ReportKind, string> = {
  occupancy: "How many of the nights you had open were booked.",
  "arrivals-departures": "How many bookings arrived and how many left.",
  cleaning: "How many cleans were marked done, week by week.",
  rates: "What the stays that checked out earned, and what that comes to per night.",
  channels: "Where the stays that checked out were booked, and what the channels took in commission.",
  "still-to-pay": "Bookings with money still owed, as of today.",
};

/** What each report counts, and where from, in full: under "How this is counted", and at the top of its spreadsheet. */
export const reportSources: Record<ReportKind, string> = {
  occupancy:
    "Nights booked (confirmed, in the house or checked out) over nights open: each switched-on unit for every night, less nights closed by the owner or for maintenance.",
  "arrivals-departures": "Bookings that hold their nights (confirmed, in the house or checked out), on their arrival and leaving days. Cancellations and no-shows aren't counted.",
  cleaning: "Cleans marked done on the Tasks page, on the day they were finished, in weeks starting on Monday.",
  rates:
    "Money from stays is the booking totals of stays checked out in these dates, the same figure the books recognise. Average per night booked (ADR) divides it by those stays' nights; earned per night open (RevPAR) divides it by the nights open.",
  channels:
    "Money from stays is the totals of stays checked out in these dates, by where each booking came from. Commission paid to channels is what the books hold in their Channel commission account for these dates, tied to a channel when it was taken off that channel's payout.",
  "still-to-pay": "Bookings that still hold their nights whose payments, less refunds, don't cover the total. As of today, whatever the dates chosen.",
};

export function exportHref(kind: ReportKind, range: ReportRange): string {
  return kind === "still-to-pay" ? `${reportsPath}/export/${kind}` : `${reportsPath}/export/${kind}?${rangeSearch(range)}`;
}

/** "occupancy-2026-11-01-to-2026-11-30.csv"; "still-to-pay-2026-11-13.csv". */
export function exportFileName(kind: ReportKind, range: ReportRange, today: IsoDate): string {
  return kind === "still-to-pay" ? `${kind}-${today}.csv` : `${kind}-${range.from}-to-${range.until}.csv`;
}

// --- how figures read ------------------------------------------------------------------

/** "64%", "Under 1%", or "None open" when no night was open. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "None open";
  if (rate > 0 && rate < 0.005) return "Under 1%";
  return `${Math.round(rate * 100)}%`;
}

/** "1 night", "1,284 nights". */
export function formatNights(nights: number): string {
  return `${formatCount(nights)} ${nights === 1 ? "night" : "nights"}`;
}

/** A whole number with comma thousands, as the site writes money: "1,284". */
export function formatCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A month's short name for a chart's axis: "Nov". */
export function monthShortLabel(part: RangePart): string {
  return formatMonthSpan(part.key, part.key).split(" ")[0] ?? part.key;
}

/** "November 2026", or "13–30 Nov 2026" for a month the dates cut. */
export function monthLabel(part: RangePart): string {
  return part.whole ? formatMonth(part.key) : formatDateSpan(part.from, part.until);
}

/** "Week of 2 Nov", or "1 Nov" / "30 Nov – 1 Dec 2026" for a week the dates cut. */
export function weekLabel(part: RangePart): string {
  return part.whole ? `Week of ${formatDayMonth(part.key)}` : formatDateSpan(part.from, part.until);
}

/** "the week of 2 Nov", or "1–4 Nov 2026" for a week the dates cut: for a sentence. */
export function weekPhrase(part: RangePart): string {
  return part.whole ? `the week of ${formatDayMonth(part.key)}` : formatDateSpan(part.from, part.until);
}

/** "2 Nov": the first day of a week within the dates, for a chart's axis. */
export function weekAxisLabel(part: RangePart): string {
  return formatDayMonth(part.from);
}

/**
 * Round axis values for a chart whose highest figure is `max`: 0, then up
 * to five even steps of 1, 2, 2.5 or 5 times a power of ten (never 2.5, nor
 * less than 1, for counts), the top at or above `max`.
 */
export function niceScale(max: number, { counts = false }: { counts?: boolean } = {}): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const factors = counts ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const fitting = factors.map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const step = counts ? Math.max(1, Math.round(fitting)) : fitting;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  return { top, ticks };
}

/** "no arrivals", "1 arrival", "3 arrivals". */
function countPhrase(count: number, one: string, many: string): string {
  return count === 0 ? `no ${many}` : `${formatCount(count)} ${count === 1 ? one : many}`;
}

const sentence = (parts: readonly string[]) => {
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The house in one line, under the dates' heading: "10% full · 3 arrivals · 3 departures · no cleans". */
export function houseSummary({ occupancyRate, arrivals, departures, cleans }: { occupancyRate: number | null; arrivals: number; departures: number; cleans: number }): string {
  return sentence([
    occupancyRate === null ? "no nights open" : `${formatRate(occupancyRate)} full`,
    countPhrase(arrivals, "arrival", "arrivals"),
    countPhrase(departures, "departure", "departures"),
    countPhrase(cleans, "clean", "cleans"),
  ]);
}

/**
 * The money in one line, under the dates' heading: "R1,700 from stays ·
 * R850 a night booked · R4,600 still to pay as of today". Still to pay
 * doesn't follow the dates, so it says so.
 */
export function moneySummary({ revenueCents, adrCents, stillToPayCents }: { revenueCents: number; adrCents: number | null; stillToPayCents: number }): string {
  return sentence([
    revenueCents === 0 ? "nothing from stays" : `${formatCents(revenueCents)} from stays`,
    ...(adrCents === null ? [] : [`${formatCents(adrCents)} a night booked`]),
    stillToPayCents === 0 ? "nothing owed as of today" : `${formatCents(stillToPayCents)} still to pay as of today`,
  ]);
}

/** Rands from cents for an axis: "R0", "R4,500", "R45K", "R1.2M". */
export function formatAxisRands(cents: number): string {
  const rands = cents / 100;
  if (rands >= 1_000_000) return `R${Number((rands / 1_000_000).toFixed(1))}M`;
  if (rands >= 10_000) return `R${Number((rands / 1_000).toFixed(1))}K`;
  return `R${formatCount(Math.round(rands))}`;
}

// --- the spreadsheets ------------------------------------------------------------------

const percentCell = (rate: number | null): CsvValue => (rate === null ? "" : (rate * 100).toFixed(1));
const centsCell = (cents: number | null): CsvValue => (cents === null ? "" : centsAsDecimal(cents));

/** Who and what the file is, then a blank row, before the figures. */
export function csvPreamble(kind: ReportKind, businessName: string, when: string): CsvValue[][] {
  return [[businessName], [reportTitles[kind]], [when], [reportSources[kind]], []];
}

const occupancyColumns = ["Unit nights", "Closed by the owner", "Closed for maintenance", "Nights open", "Nights booked", "Occupancy (%)"];

export function occupancyCsv(report: Occupancy): CsvValue[][] {
  const figures = (row: Occupancy["total"]): CsvValue[] => [row.unitNights, row.closedNights, row.maintenanceNights, row.availableNights, row.soldNights, percentCell(row.rate)];
  return [
    ["Month", "From", "Until", ...occupancyColumns],
    ...report.months.map((row) => [formatMonth(row.month.key), row.month.from, row.month.until, ...figures(row)]),
    ["Total", report.range.from, report.range.until, ...figures(report.total)],
    [],
    ["Apartment", "Units", "", ...occupancyColumns],
    ...report.apartments.map((row) => [row.name, row.units, "", ...figures(row)]),
    [],
    ["Nights held by channel stays not yet made into bookings (counted as open, not booked)", report.heldNotSold.channelNights],
    ["Nights held by booking requests waiting for an answer (counted as open, not booked)", report.heldNotSold.requestNights],
    ["Nights booked in units switched off now (left out of both)", report.switchedOffNights],
  ];
}

export function movementsCsv(report: Movements): CsvValue[][] {
  return [
    ["Month", "From", "Until", "Arrivals", "Departures"],
    ...report.months.map((row) => [formatMonth(row.month.key), row.month.from, row.month.until, row.arrivals, row.departures]),
    ["Total", "", "", report.arrivals, report.departures],
  ];
}

export function cleaningCsv(report: Throughput): CsvValue[][] {
  return [["Week starting (Monday)", "From", "Until", "Cleans done"], ...report.weeks.map((row) => [row.week.key, row.week.from, row.week.until, row.cleans]), ["Total", "", "", report.cleans]];
}

export function ratesCsv(report: Revenue): CsvValue[][] {
  const figures = (row: Revenue["total"]): CsvValue[] => [centsCell(row.revenueCents), row.stays, row.nights, centsCell(row.adrCents), row.availableNights, centsCell(row.revparCents)];
  return [
    ["Month", "From", "Until", figureNames.revenue, "Stays checked out", "Nights in those stays", figureNames.adr, "Nights open", figureNames.revpar],
    ...report.months.map((row) => [formatMonth(row.month.key), row.month.from, row.month.until, ...figures(row)]),
    ["Total", "", "", ...figures(report.total)],
  ];
}

export function channelsCsv(report: ChannelMix): CsvValue[][] {
  return [
    ["Where bookings came from", "Stays checked out", "Nights", figureNames.revenue, figureNames.commission],
    ...report.rows.map((row) => [row.name, row.stays, row.nights, centsCell(row.revenueCents), centsCell(row.commissionCents)]),
    ["Total", "", "", centsCell(report.revenueCents), centsCell(report.commissionCents)],
  ];
}

export function balancesCsv(report: Balances): CsvValue[][] {
  return [
    ["Booking", "Guest", "Status", "Arrives", "Leaves", "Where it came from", "Total", "Paid", "Still to pay"],
    ...report.rows.map((row) => [
      row.ref,
      row.guestName,
      bookingStatusNames[row.status],
      row.stay.arrive,
      row.stay.leave,
      sourceName(row.channel),
      centsCell(row.totalCents),
      centsCell(row.paidCents),
      centsCell(row.balanceCents),
    ]),
    ["Total", "", "", "", "", "", "", "", centsCell(report.totalCents)],
  ];
}

/** "As of 13 Nov 2026", for a report that doesn't follow the dates. */
export function asOfLabel(today: IsoDate): string {
  return `As of ${formatDateShort(today)}`;
}
