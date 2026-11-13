import { addDays, type IsoDate } from "@/lib/format/zoned-time";
import { nightsIn, type Stay } from "@/lib/inventory/stays";

/**
 * What a stay costs. Each apartment type has one rate plan: a nightly price
 * for up to `baseGuests`, a charge per extra guest per night, and a minimum
 * stay. Seasons (date ranges that never overlap) can set a different nightly
 * price for any apartment, and a longer minimum stay. Money is in cents
 * (ZAR), so sums never drift. Prices on the public site come from here and
 * aren't finance data (roles.md); only the owner and sales can change them.
 */

export type RatePlan = {
  /** The apartment type's slug (site content). */
  apartment: string;
  /** The price of a night for up to `baseGuests` guests. */
  nightlyCents: number;
  baseGuests: number;
  /** Added per night for each guest over `baseGuests`. */
  extraGuestCents: number;
  /** The shortest stay this apartment takes. */
  minNights: number;
  /** An inactive plan is kept but gives no price: the site says "Price on request". */
  active: boolean;
  updatedAt: Date;
  updatedBy: string | null;
};

export type Season = {
  id: string;
  name: string;
  /** Its nights: from the first night up to, not including, the morning after the last ([first, last + 1)). */
  nights: Stay;
  /** A longer minimum stay for stays touching this season, or null to keep each plan's. */
  minNights: number | null;
  /** The nightly price in this season, by apartment slug; an apartment not listed keeps its plan's price. */
  prices: Record<string, number>;
  updatedAt: Date;
  updatedBy: string | null;
};

/** The last night of a season, as people say it ("1 December to 10 January" means the night of the 10th is in). */
export function lastNightOf(season: Pick<Season, "nights">): IsoDate {
  return addDays(season.nights.leave, -1);
}

export type NightPrice = {
  date: IsoDate;
  /** The night's price for up to the plan's base guests (the season's when one sets it). */
  nightlyCents: number;
  /** The extra guests' charge for this night. */
  extraCents: number;
  /** The season that set the price, or null for the plan's own. */
  seasonId: string | null;
};

export type Quote = {
  totalCents: number;
  nights: NightPrice[];
  /** The longest minimum that applies: the plan's, or a season's that any night falls in. */
  minNights: number;
  meetsMinimum: boolean;
};

/**
 * The price of `stay` for `guests` in the apartment `plan` is for, given
 * the seasons (any order; only those covering the stay's nights matter).
 * Null without an active plan: the site then says "Price on request".
 */
export function quoteFor(plan: RatePlan | null, seasons: readonly Season[], stay: Stay, guests: number): Quote | null {
  if (!plan || !plan.active) return null;
  const extraGuests = Math.max(0, guests - plan.baseGuests);
  let minNights = plan.minNights;
  const nights = nightsIn(stay).map((date): NightPrice => {
    const season = seasons.find((candidate) => candidate.nights.arrive <= date && date < candidate.nights.leave) ?? null;
    if (season?.minNights) minNights = Math.max(minNights, season.minNights);
    const seasonal = season ? season.prices[plan.apartment] : undefined;
    return {
      date,
      nightlyCents: seasonal ?? plan.nightlyCents,
      extraCents: extraGuests * plan.extraGuestCents,
      seasonId: seasonal === undefined ? null : season!.id,
    };
  });
  const totalCents = nights.reduce((sum, night) => sum + night.nightlyCents + night.extraCents, 0);
  return { totalCents, nights, minNights, meetsMinimum: nights.length >= minNights };
}
