import type { Metadata } from "next";
import { RatesScreen, type RatedApartmentRow, type SeasonRow } from "@/components/admin/rates/rates-screen";
import { can } from "@/lib/accounts/access";
import { centsForInput, formatCents } from "@/lib/format/money";
import { lastNightOf } from "@/lib/rates/rates";
import { seasonNightsLabel } from "@/lib/rates/rate-service";
import { requireDashboardActor } from "@/server/admin-session";
import { rateService } from "@/server/rates";
import { addSeason, changeSeason, removeRatePlan, removeSeason, saveRatePlan } from "./actions";

export const metadata: Metadata = { title: "Rates" };

/**
 * Nightly rates and seasons, for the owner and sales (rates:view to see,
 * rates:manage to change). Never admin or staff. The prices themselves are
 * public once set: the website shows them.
 */
export default async function RatesPage() {
  const actor = await requireDashboardActor({ permission: "rates:view" });
  const { apartmentTypes, plans, seasons } = await rateService().overview(actor);
  const names = Object.fromEntries(apartmentTypes.map((type) => [type.slug, type.name]));
  const apartments: RatedApartmentRow[] = apartmentTypes.map((type) => {
    const plan = plans[type.slug];
    return {
      slug: type.slug,
      name: type.name,
      sleeps: type.sleeps,
      plan: plan
        ? {
            nightly: centsForInput(plan.nightlyCents),
            baseGuests: plan.baseGuests,
            extraGuest: centsForInput(plan.extraGuestCents),
            minNights: plan.minNights,
            active: plan.active,
            summary: [
              `${formatCents(plan.nightlyCents)} a night for up to ${plan.baseGuests} ${plan.baseGuests === 1 ? "guest" : "guests"}`,
              plan.extraGuestCents > 0 ? `${formatCents(plan.extraGuestCents)} per extra guest a night` : "no charge for extra guests",
              `at least ${plan.minNights} ${plan.minNights === 1 ? "night" : "nights"}`,
            ].join(" · "),
          }
        : null,
    };
  });
  const seasonRows: SeasonRow[] = seasons.map((season) => ({
    id: season.id,
    name: season.name,
    firstNight: season.nights.arrive,
    lastNight: lastNightOf(season),
    nightsLabel: seasonNightsLabel(season),
    minNights: season.minNights,
    prices: Object.fromEntries(Object.entries(season.prices).map(([slug, cents]) => [slug, centsForInput(cents)])),
    priceLines: Object.entries(season.prices).map(([slug, cents]) => `${names[slug] ?? slug}: ${formatCents(cents)} a night`),
  }));
  return (
    <RatesScreen
      apartments={apartments}
      seasons={seasonRows}
      canManage={can(actor, "rates:manage")}
      actions={{ saveRatePlan, removeRatePlan, addSeason, changeSeason, removeSeason }}
    />
  );
}
