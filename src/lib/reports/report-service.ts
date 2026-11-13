import { zonedDayBounds, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { Clock } from "@/lib/kernel/ports";
import type { Instants, ReportAccess, ReportStore } from "./ports";
import { isReportRange, maxRangeDays, type ReportRange } from "./report-range";
import {
  balancesOf,
  channelMixOf,
  movementsOf,
  occupancyOf,
  revenueOf,
  throughputOf,
  type Balances,
  type ChannelMix,
  type Movements,
  type Occupancy,
  type Revenue,
  type Throughput,
} from "./reports";

export type ReportServiceDependencies = {
  store: ReportStore;
  /** The apartment types' names by slug, from the site's content. */
  apartmentNames: () => Promise<Readonly<Record<string, string>>>;
  clock: Clock;
  /** The business's time zone: days, months and weeks are its own. */
  timeZone: string;
  access: ReportAccess;
};

export type OperationsReport = { range: ReportRange; occupancy: Occupancy; movements: Movements; cleaning: Throughput };

export type RevenueReport = { range: ReportRange; revenue: Revenue; channels: ChannelMix };

export type BalancesReport = { asOf: IsoDate; balances: Balances };

/**
 * The reports (docs/planning/roles.md): operations (occupancy, arrivals and
 * departures, cleaning) for whoever holds reports:operations (the owner and
 * sales), with no money in them; revenue (ADR, RevPAR, channels, balances)
 * for reports:revenue (the owner). Every method checks its permission
 * before it reads anything. Nothing here writes.
 */
export function createReportService(deps: ReportServiceDependencies) {
  const { store, access, clock, timeZone } = deps;

  const today = () => zonedToday(clock.now(), timeZone);

  /** A range the caller worked out: a bad one is a mistake in the code, not something to show. */
  function assertRange(range: ReportRange): void {
    const { from, until } = range;
    if (!isReportRange(range)) throw new RangeError(`A report covers 1 to ${maxRangeDays} days, from the earlier date: got ${from} to ${until}.`);
  }

  /** From the start of the first day to the end of the last, in the business's time zone. */
  const instantsOf = (range: ReportRange): Instants => ({ start: zonedDayBounds(range.from, timeZone).start, end: zonedDayBounds(range.until, timeZone).end });

  async function occupancyFor(range: ReportRange) {
    const [units, stays, blocks, apartmentNames] = await Promise.all([store.units(), store.staysAround(range), store.blocksWithin(range), deps.apartmentNames()]);
    return { occupancy: occupancyOf({ range, units, stays, blocks, apartmentNames }), stays };
  }

  return {
    /** Today, and the month the financial year ends: what the reports' date choices are worked out from. For anyone who sees any report. */
    async dates(actor: Actor): Promise<{ today: IsoDate; yearEndMonth: number }> {
      if (!access.can(actor, "reports:revenue")) access.assertCan(actor, "reports:operations");
      return { today: today(), yearEndMonth: await store.yearEndMonth() };
    },

    /** Occupancy, arrivals and departures, and cleans done: no money. */
    async operations(actor: Actor, range: ReportRange): Promise<OperationsReport> {
      access.assertCan(actor, "reports:operations");
      assertRange(range);
      const [{ occupancy, stays }, cleanTimes] = await Promise.all([occupancyFor(range), store.cleansDone(instantsOf(range))]);
      return {
        range,
        occupancy,
        movements: movementsOf(range, stays),
        cleaning: throughputOf(
          range,
          cleanTimes.map((at) => zonedToday(at, timeZone)),
        ),
      };
    },

    /** Accommodation revenue, ADR and RevPAR by month, and revenue and commission by channel. The owner's. */
    async revenue(actor: Actor, range: ReportRange): Promise<RevenueReport> {
      access.assertCan(actor, "reports:revenue");
      assertRange(range);
      const [{ occupancy }, checkedOut, commission, channelNames] = await Promise.all([
        occupancyFor(range),
        store.checkedOut(instantsOf(range)),
        store.commission(range),
        store.channelNames(),
      ]);
      const stays = checkedOut.map(({ checkedOutAt, ...stay }) => ({ ...stay, checkedOutOn: zonedToday(checkedOutAt, timeZone) }));
      return { range, revenue: revenueOf(range, stays, occupancy), channels: channelMixOf(range, stays, commission, channelNames) };
    },

    /** Bookings with money still to pay, as of today, whatever dates the other reports cover. The owner's. */
    async balances(actor: Actor): Promise<BalancesReport> {
      access.assertCan(actor, "reports:revenue");
      return { asOf: today(), balances: balancesOf(await store.owing()) };
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
