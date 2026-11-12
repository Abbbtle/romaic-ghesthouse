import { parseWith } from "@/lib/forms/parse";
import { formatDateSpan } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { addDays, daysBetween } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { RateAccess, RateStore } from "./ports";
import { rateLimits, ratePlanSchema, seasonPricesOf, seasonSchema } from "./rate-input";
import { lastNightOf, quoteFor, type Quote, type RatePlan, type Season } from "./rates";

/** An apartment type as the rates see it, from the site's content. */
export type RatedApartment = { slug: string; name: string; sleeps: number };

export type RateServiceDependencies = {
  store: RateStore;
  /** Every apartment type in the site's content, in its order. */
  apartmentTypes: () => Promise<RatedApartment[]>;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: RateAccess;
};

/** What the dashboard's Rates page shows. */
export type RatesOverview = {
  apartmentTypes: RatedApartment[];
  /** Plans by apartment slug; an apartment without one is "Price on request". */
  plans: Record<string, RatePlan>;
  seasons: Season[];
};

const seasonGone = "This season was changed or removed. Reload the page.";

/** "1–10 Dec 2026": a season's nights as people say them, first to last. */
export function seasonNightsLabel(season: Pick<Season, "nights">): string {
  return formatDateSpan(season.nights.arrive, lastNightOf(season));
}

/** Rate plans and seasons: the dashboard's Rates page, and the prices the site and bookings use. */
export function createRateService(deps: RateServiceDependencies) {
  const { store, clock, ids, audit, access } = deps;

  async function record(actor: Actor, action: string, summary: string, target: { type: string; id: string }) {
    await audit.record({ actor, category: "bookings", action, target, summary });
  }

  async function apartmentNamed(slug: string): Promise<RatedApartment | null> {
    return (await deps.apartmentTypes()).find((type) => type.slug === slug) ?? null;
  }

  /** A season from its form, or the problems with it. */
  async function seasonFrom(input: unknown, id: string, by: string): Promise<{ ok: true; season: Season } | { ok: false; errors: Record<string, string> }> {
    const parsed = parseWith(seasonSchema, input);
    const prices = seasonPricesOf(input, (await deps.apartmentTypes()).map((type) => type.slug));
    if (!parsed.ok || !prices.ok) return { ok: false, errors: { ...(parsed.ok ? {} : parsed.errors), ...(prices.ok ? {} : prices.errors) } };
    const nights: Stay = { arrive: parsed.value.firstNight, leave: addDays(parsed.value.lastNight, 1) };
    if (daysBetween(nights.arrive, nights.leave) > rateLimits.maxSeasonNights) {
      return { ok: false, errors: { lastNight: `Keep a season under ${rateLimits.maxSeasonNights} nights. Make two for a longer stretch.` } };
    }
    if (Object.keys(prices.prices).length === 0 && parsed.value.minNights === null) {
      return { ok: false, errors: { form: "Give the season a price for at least one apartment, or a minimum stay, or it changes nothing." } };
    }
    return {
      ok: true,
      season: { id, name: parsed.value.name, nights, minNights: parsed.value.minNights, prices: prices.prices, updatedAt: clock.now(), updatedBy: by },
    };
  }

  return {
    /** Plans and seasons for the Rates page. */
    async overview(actor: Actor): Promise<RatesOverview> {
      access.assertCan(actor, "rates:view");
      const [apartmentTypes, plans, seasons] = await Promise.all([deps.apartmentTypes(), store.plans(), store.seasons()]);
      return { apartmentTypes, plans: Object.fromEntries(plans.map((plan) => [plan.apartment, plan])), seasons };
    },

    /** Sets an apartment's nightly rate, extra guest charge and minimum stay. */
    async savePlan(actor: Actor, apartment: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      const type = await apartmentNamed(apartment);
      if (!type) return refusedWith("That apartment isn't on the website any more. Reload the page.");
      const parsed = parseWith(ratePlanSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { nightly, baseGuests, extraGuest, minNights, active } = parsed.value;
      if (baseGuests > type.sleeps) return refused({ baseGuests: `This apartment sleeps up to ${type.sleeps}, so the price can be for ${type.sleeps} at most.` });
      await store.savePlan({ apartment, nightlyCents: nightly, baseGuests, extraGuestCents: extraGuest, minNights, active, updatedAt: clock.now(), updatedBy: actor.id });
      await record(
        actor,
        "rates.plan-saved",
        `Set ${type.name} to ${formatCents(nightly)} a night for up to ${baseGuests}${extraGuest > 0 ? `, ${formatCents(extraGuest)} per extra guest` : ""}, at least ${minNights} ${minNights === 1 ? "night" : "nights"}${active ? "" : " (not in use)"}`,
        { type: "rate-plan", id: apartment },
      );
      return done();
    },

    /** Removes an apartment's rate: the site goes back to "Price on request" for it. */
    async removePlan(actor: Actor, apartment: string): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      if (!(await store.removePlan(apartment))) return refusedWith("This apartment has no rate to remove. Reload the page.");
      const type = await apartmentNamed(apartment);
      await record(actor, "rates.plan-removed", `Removed the rate for ${type?.name ?? apartment}`, { type: "rate-plan", id: apartment });
      return done();
    },

    async addSeason(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "rates:manage");
      const built = await seasonFrom(input, ids.newId(), actor.id);
      if (!built.ok) return refused(built.errors);
      const outcome = await store.addSeason(built.season);
      if (outcome.status === "overlaps") return refused({ firstNight: "This season shares nights with another. Seasons can't overlap: change the dates or the other season." });
      await record(actor, "rates.season-added", `Added the season ${built.season.name}, ${seasonNightsLabel(built.season)}`, { type: "season", id: built.season.id });
      return done({ id: built.season.id });
    },

    async changeSeason(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      if (!(await store.season(id))) return refusedWith(seasonGone);
      const built = await seasonFrom(input, id, actor.id);
      if (!built.ok) return refused(built.errors);
      const outcome = await store.changeSeason(built.season);
      if (outcome.status === "missing") return refusedWith(seasonGone);
      if (outcome.status === "overlaps") return refused({ firstNight: "This season would share nights with another. Seasons can't overlap." });
      await record(actor, "rates.season-changed", `Changed the season ${built.season.name}, ${seasonNightsLabel(built.season)}`, { type: "season", id });
      return done();
    },

    async removeSeason(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "rates:manage");
      const season = await store.season(id);
      if (!season || !(await store.removeSeason(id))) return refusedWith(seasonGone);
      await record(actor, "rates.season-removed", `Removed the season ${season.name}, ${seasonNightsLabel(season)}`, { type: "season", id });
      return done();
    },

    /**
     * The price of a stay in an apartment for a group: public (prices on the
     * site aren't finance data), so no actor. Null when the apartment has no
     * rate in use.
     */
    async quote(apartment: string, stay: Stay, guests: number): Promise<Quote | null> {
      const [plan, seasons] = await Promise.all([store.plan(apartment), store.seasonsOverlapping(stay)]);
      return quoteFor(plan, seasons, stay, guests);
    },

    /** Each apartment's nightly price ("From R800 a night"), for the ones with a rate in use. Public. */
    async fromPrices(): Promise<Record<string, number>> {
      return Object.fromEntries((await store.plans()).filter((plan) => plan.active).map((plan) => [plan.apartment, plan.nightlyCents]));
    },
  };
}

export type RateService = ReturnType<typeof createRateService>;
