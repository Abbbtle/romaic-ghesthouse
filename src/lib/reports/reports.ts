import type { IsoDate } from "@/lib/format/zoned-time";
import { nightsOf, type Stay } from "@/lib/inventory/stays";
import { channelReceivables, systemAccounts } from "@/lib/ledger/accounts";
import { summaryOf, type Payment } from "@/lib/money/money";
import { directSourceNames, holdsNights, type BookingStatus } from "@/lib/reservations/reservations";
import { inRange, monthOf, monthsOf, nightsWithin, rangeDays, weeksOf, type RangePart, type ReportRange } from "./report-range";

/**
 * The reports' sums, worked out from plain records the store reads. Nothing
 * here is estimated or filled in: every figure is a count or a sum of what
 * the database holds, and a ratio with nothing under it is null, never 0.
 *
 * Operations (occupancy, arrivals and departures, cleaning) carry no money.
 * Revenue (average rate, revenue per available night, channels, balances)
 * is for the owner only; the service checks who asks.
 *
 * How the figures are counted, decided once and used everywhere:
 *
 * - **Nights sold** are the nights of bookings that hold them (confirmed,
 *   checked in, checked out), in units that are switched on.
 * - **Nights available** are each switched-on unit for every night, less
 *   the nights it was closed by the owner and the nights it was closed for
 *   maintenance (both are taken off; each is shown on its own line). A unit
 *   switched off now counts for none of the range, and its bookings' nights
 *   aren't counted as sold either, so the two sides always cover the same
 *   units; how many nights that leaves out is reported.
 * - Nights held by a channel stay not yet made into a booking, or by a
 *   booking request waiting for an answer, are neither sold nor closed: they
 *   count as available, and are reported beside the figures.
 * - **Accommodation revenue** is the booking totals of stays checked out in
 *   the range (on the check-out day, in the business's time zone): the same
 *   figure the books recognise in Accommodation (4000) at check-out. The
 *   average rate (ADR) divides it by those stays' nights; revenue per
 *   available night (RevPAR) divides it by the nights available.
 * - **Channel commission** is what the books hold in Channel commission
 *   (5000) for journals dated in the range, net of reversals. A journal is
 *   tied to a channel when its other side is that channel's receivable (a
 *   commission taken off the channel's payout); otherwise it's shown as not
 *   tied to one (paid from the bank, in cash, by the owner, or posted by hand).
 * - **Still to pay** uses the money core's own sum (summaryOf): the total less
 *   received payments, less refunds, for bookings that still hold their nights.
 */

// --- occupancy -------------------------------------------------------------------------

export type ReportUnit = { id: string; apartment: string; active: boolean };

/** A booking that holds its nights, as occupancy and arrivals see it. */
export type HeldStay = { unitId: string; status: BookingStatus; stay: Stay };

/** Why a unit's nights are blocked without a booking. Bookings' own blocks aren't read: the bookings are. */
export const heldBlockReasons = ["owner", "maintenance", "channel", "request"] as const;
export type HeldBlockReason = (typeof heldBlockReasons)[number];

export type HeldBlock = { unitId: string; reason: HeldBlockReason; stay: Stay };

export type OccupancyFigures = {
  /** Switched-on units × nights: every night the apartments could hold a guest before closures. */
  unitNights: number;
  /** Nights closed by the owner. */
  closedNights: number;
  /** Nights closed for maintenance. */
  maintenanceNights: number;
  /** Unit nights less both kinds of closure: the nights that could be sold. */
  availableNights: number;
  soldNights: number;
  /** Nights sold over nights available, 0 to 1; null when no night was available. */
  rate: number | null;
};

export type MonthOccupancy = OccupancyFigures & { month: RangePart };

export type ApartmentOccupancy = OccupancyFigures & { apartment: string; name: string; units: number };

export type Occupancy = {
  range: ReportRange;
  activeUnits: number;
  total: OccupancyFigures;
  months: MonthOccupancy[];
  /** One row per apartment type with a switched-on unit, in the units' order. */
  apartments: ApartmentOccupancy[];
  /** Nights held but not sold, counted as available: channel stays not yet made into bookings, and waiting booking requests. */
  heldNotSold: { channelNights: number; requestNights: number };
  /** Booked nights in units switched off now: left out of both sides. */
  switchedOffNights: number;
};

function figuresOf(unitNights: number, closedNights: number, maintenanceNights: number, soldNights: number): OccupancyFigures {
  const availableNights = unitNights - closedNights - maintenanceNights;
  return { unitNights, closedNights, maintenanceNights, availableNights, soldNights, rate: availableNights > 0 ? soldNights / availableNights : null };
}

export type OccupancyInput = {
  range: ReportRange;
  units: readonly ReportUnit[];
  stays: readonly HeldStay[];
  blocks: readonly HeldBlock[];
  /** Apartment types' names by slug, from the site's content; a missing one reads as its slug. */
  apartmentNames: Readonly<Record<string, string>>;
};

export function occupancyOf({ range, units, stays, blocks, apartmentNames }: OccupancyInput): Occupancy {
  const active = units.filter((unit) => unit.active);
  const activeIds = new Set(active.map((unit) => unit.id));
  const sold = stays.filter((stay) => holdsNights(stay.status) && activeIds.has(stay.unitId));
  const activeBlocks = blocks.filter((block) => activeIds.has(block.unitId));
  const nightsIn = (items: readonly { stay: Stay }[], part: ReportRange) => items.reduce((sum, item) => sum + nightsWithin(item.stay, part), 0);
  const closures = (part: ReportRange, unitIds: ReadonlySet<string>) => {
    const own = activeBlocks.filter((block) => unitIds.has(block.unitId));
    return {
      closed: nightsIn(own.filter((block) => block.reason === "owner"), part),
      maintenance: nightsIn(own.filter((block) => block.reason === "maintenance"), part),
    };
  };
  const figuresFor = (part: ReportRange, unitIds: ReadonlySet<string>) => {
    const { closed, maintenance } = closures(part, unitIds);
    const soldNights = nightsIn(sold.filter((stay) => unitIds.has(stay.unitId)), part);
    return figuresOf(unitIds.size * rangeDays(part), closed, maintenance, soldNights);
  };

  const slugs = [...new Set(active.map((unit) => unit.apartment))];
  return {
    range,
    activeUnits: active.length,
    total: figuresFor(range, activeIds),
    months: monthsOf(range).map((month) => ({ month, ...figuresFor(month, activeIds) })),
    apartments: slugs.map((apartment) => {
      const ids = new Set(active.filter((unit) => unit.apartment === apartment).map((unit) => unit.id));
      return { apartment, name: apartmentNames[apartment] ?? apartment, units: ids.size, ...figuresFor(range, ids) };
    }),
    heldNotSold: {
      channelNights: nightsIn(activeBlocks.filter((block) => block.reason === "channel"), range),
      requestNights: nightsIn(activeBlocks.filter((block) => block.reason === "request"), range),
    },
    switchedOffNights: nightsIn(
      stays.filter((stay) => holdsNights(stay.status) && !activeIds.has(stay.unitId)),
      range,
    ),
  };
}

// --- arrivals and departures -----------------------------------------------------------

export type MonthMovements = { month: RangePart; arrivals: number; departures: number };

export type Movements = { arrivals: number; departures: number; months: MonthMovements[] };

/**
 * Arrivals and departures: bookings that hold their nights, counted on their
 * arrival day and their leaving day (an early check-out moves its leaving
 * day). Every unit counts, switched on or not: a guest who came is an arrival.
 */
export function movementsOf(range: ReportRange, stays: readonly HeldStay[]): Movements {
  const held = stays.filter((stay) => holdsNights(stay.status));
  const arriving = held.filter((stay) => inRange(stay.stay.arrive, range));
  const leaving = held.filter((stay) => inRange(stay.stay.leave, range));
  return {
    arrivals: arriving.length,
    departures: leaving.length,
    months: monthsOf(range).map((month) => ({
      month,
      arrivals: arriving.filter((stay) => monthOf(stay.stay.arrive) === month.key).length,
      departures: leaving.filter((stay) => monthOf(stay.stay.leave) === month.key).length,
    })),
  };
}

// --- cleaning --------------------------------------------------------------------------

export type WeekCleans = { week: RangePart; cleans: number };

export type Throughput = {
  cleans: number;
  /** Every week the range touches, Monday first, a week with none at 0. */
  weeks: WeekCleans[];
  /** The week with the most cleans (the first, on a tie); null when there were none. */
  busiest: WeekCleans | null;
};

/** Cleans done per week, from the days housekeeping tasks were marked done (in the business's time zone). */
export function throughputOf(range: ReportRange, cleanDays: readonly IsoDate[]): Throughput {
  const counted = cleanDays.filter((day) => inRange(day, range));
  const weeks = weeksOf(range).map((week) => ({ week, cleans: counted.filter((day) => inRange(day, week)).length }));
  const busiest = weeks.reduce<WeekCleans | null>((best, week) => (week.cleans > (best?.cleans ?? 0) ? week : best), null);
  return { cleans: counted.length, weeks, busiest };
}

// --- revenue ---------------------------------------------------------------------------

/** A stay that's checked out, with its total and where it came from. */
export type CheckedOutStay = { bookingId: string; channel: string; stay: Stay; totalCents: number; checkedOutOn: IsoDate };

export type RevenueFigures = {
  revenueCents: number;
  /** Stays checked out. */
  stays: number;
  /** The nights those stays lasted. */
  nights: number;
  /** Revenue per night of those stays, in whole cents; null with no nights. */
  adrCents: number | null;
  availableNights: number;
  /** Revenue per available night, in whole cents; null with no night available. */
  revparCents: number | null;
};

export type MonthRevenue = RevenueFigures & { month: RangePart };

export type Revenue = { total: RevenueFigures; months: MonthRevenue[] };

/** A ratio of cents to a count, rounded to whole cents; null when there's nothing to divide by. */
function perUnit(cents: number, count: number): number | null {
  return count > 0 ? Math.round(cents / count) : null;
}

function revenueFigures(stays: readonly CheckedOutStay[], availableNights: number): RevenueFigures {
  const revenueCents = stays.reduce((sum, stay) => sum + stay.totalCents, 0);
  const nights = stays.reduce((sum, stay) => sum + nightsOf(stay.stay), 0);
  return { revenueCents, stays: stays.length, nights, adrCents: perUnit(revenueCents, nights), availableNights, revparCents: perUnit(revenueCents, availableNights) };
}

/** Accommodation revenue, ADR and RevPAR over the range and by month, from stays checked out in it and the occupancy's nights available. */
export function revenueOf(range: ReportRange, stays: readonly CheckedOutStay[], occupancy: Pick<Occupancy, "total" | "months">): Revenue {
  const counted = stays.filter((stay) => inRange(stay.checkedOutOn, range));
  return {
    total: revenueFigures(counted, occupancy.total.availableNights),
    months: occupancy.months.map(({ month, availableNights }) => ({
      month,
      ...revenueFigures(
        counted.filter((stay) => monthOf(stay.checkedOutOn) === month.key),
        availableNights,
      ),
    })),
  };
}

// --- channels --------------------------------------------------------------------------

/** One journal with a line on Channel commission (5000): its net on that account, and the other accounts it touches. */
export type CommissionEntry = { journalId: string; date: IsoDate; cents: number; counterAccounts: readonly string[] };

/** The receivable an otherwise unknown channel's money goes to: commission taken off it can't be tied to one channel. */
export const otherChannelsReceivable = systemAccounts.otaReceivables;

const channelByReceivable = new Map(Object.entries(channelReceivables).map(([channel, code]) => [code, channel]));

/**
 * Which channel a commission journal belongs to: the channel whose
 * receivable its other side is ("booking-com"), "other-channels" for the
 * receivable shared by channels without their own, or null when it touches
 * no channel's receivable, or more than one.
 */
export function commissionChannel(entry: Pick<CommissionEntry, "counterAccounts">): string | "other-channels" | null {
  const receivables = [...new Set(entry.counterAccounts)].filter((code) => channelByReceivable.has(code) || code === otherChannelsReceivable);
  if (receivables.length !== 1) return null;
  const [code] = receivables as [string];
  return code === otherChannelsReceivable ? "other-channels" : (channelByReceivable.get(code) ?? null);
}

/** source: where bookings came from; other-channels: commission off the shared receivable; untied: commission tied to no channel. */
export type ChannelRowKind = "source" | "other-channels" | "untied";

export type ChannelRow = {
  kind: ChannelRowKind;
  /** The booking source's key for a source row ("booking-com", "direct"); null otherwise. */
  key: string | null;
  name: string;
  stays: number;
  nights: number;
  revenueCents: number;
  commissionCents: number;
};

export type ChannelMix = {
  /** Sources by revenue, highest first; then commission that couldn't be tied to one of them. */
  rows: ChannelRow[];
  revenueCents: number;
  commissionCents: number;
};

/** A booking source's name: a direct source's ("Phone or WhatsApp"), a channel's from its record ("Booking.com"), or its key. */
export function sourceNameOf(key: string, channelNames: Readonly<Record<string, string>>): string {
  return (directSourceNames as Readonly<Record<string, string>>)[key] ?? channelNames[key] ?? key;
}

/** Revenue (stays checked out in the range) and commission (the books' 5000 in the range) by where bookings came from. */
export function channelMixOf(
  range: ReportRange,
  stays: readonly CheckedOutStay[],
  commission: readonly CommissionEntry[],
  channelNames: Readonly<Record<string, string>>,
): ChannelMix {
  const sources = new Map<string, ChannelRow>();
  const source = (key: string) => {
    let row = sources.get(key);
    if (!row) {
      row = { kind: "source", key, name: sourceNameOf(key, channelNames), stays: 0, nights: 0, revenueCents: 0, commissionCents: 0 };
      sources.set(key, row);
    }
    return row;
  };
  for (const stay of stays.filter((item) => inRange(item.checkedOutOn, range))) {
    const row = source(stay.channel);
    row.stays += 1;
    row.nights += nightsOf(stay.stay);
    row.revenueCents += stay.totalCents;
  }
  let otherChannels = 0;
  let untied = 0;
  for (const entry of commission.filter((item) => inRange(item.date, range))) {
    const channel = commissionChannel(entry);
    if (channel === "other-channels") otherChannels += entry.cents;
    else if (channel === null) untied += entry.cents;
    else source(channel).commissionCents += entry.cents;
  }
  const extra = (kind: Exclude<ChannelRowKind, "source">, name: string, cents: number): ChannelRow[] =>
    cents === 0 ? [] : [{ kind, key: null, name, stays: 0, nights: 0, revenueCents: 0, commissionCents: cents }];
  const rows = [
    ...[...sources.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.commissionCents - a.commissionCents || a.name.localeCompare(b.name)),
    ...extra("other-channels", "Other channels", otherChannels),
    ...extra("untied", "Not tied to a channel", untied),
  ];
  return {
    rows,
    revenueCents: rows.reduce((sum, row) => sum + row.revenueCents, 0),
    commissionCents: rows.reduce((sum, row) => sum + row.commissionCents, 0),
  };
}

// --- still to pay ----------------------------------------------------------------------

/** A booking that may still be owed money, with every payment recorded against it. */
export type OwingBooking = {
  id: string;
  ref: string;
  status: BookingStatus;
  stay: Stay;
  channel: string;
  guestName: string;
  totalCents: number;
  depositDueCents: number;
  payments: readonly Payment[];
};

export type OutstandingBalance = {
  bookingId: string;
  ref: string;
  status: BookingStatus;
  stay: Stay;
  channel: string;
  guestName: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
};

/** Who owes: grouped by where the stay is (checked out and gone, in the house, not checked in yet). */
export const balanceGroups = ["checked-out", "checked-in", "confirmed"] as const;
export type BalanceGroup = (typeof balanceGroups)[number];

export type Balances = {
  /** Arrival order. */
  rows: OutstandingBalance[];
  totalCents: number;
  groups: { status: BalanceGroup; rows: OutstandingBalance[]; totalCents: number }[];
};

/** Bookings that still hold their nights with money still to pay (summaryOf: the total less what's been paid, net of refunds). */
export function balancesOf(bookings: readonly OwingBooking[]): Balances {
  const rows = bookings
    .filter((booking) => holdsNights(booking.status))
    .map((booking): OutstandingBalance => {
      const summary = summaryOf(booking, booking.payments);
      return {
        bookingId: booking.id,
        ref: booking.ref,
        status: booking.status,
        stay: booking.stay,
        channel: booking.channel,
        guestName: booking.guestName,
        totalCents: summary.totalCents,
        paidCents: summary.paidCents,
        balanceCents: summary.balanceCents,
      };
    })
    .filter((row) => row.balanceCents > 0)
    .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive) || a.ref.localeCompare(b.ref));
  const total = (items: readonly OutstandingBalance[]) => items.reduce((sum, row) => sum + row.balanceCents, 0);
  return {
    rows,
    totalCents: total(rows),
    groups: balanceGroups
      .map((status) => {
        const inGroup = rows.filter((row) => row.status === status);
        return { status, rows: inGroup, totalCents: total(inGroup) };
      })
      .filter((group) => group.rows.length > 0),
  };
}
