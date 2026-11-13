import { apartmentPath } from "@/lib/content/pages";
import { formatCents } from "@/lib/format/money";
import type { Apartment } from "@/lib/content/schema";
import type { ApartmentSummary } from "./apartment-card";

/**
 * An apartment from the site's content as its card shows it. The card's
 * three short facts are read from the apartment's own words (a kitchenette
 * among its features, a private bathroom, Wi-Fi), so they can't claim
 * anything the apartment's details don't. `fromCents` is the apartment's
 * nightly rate when it has one in use ("From R850 a night"); without one the
 * card says "Price on request".
 */
export function apartmentSummaryOf(apartment: Apartment, fromCents: number | null = null): ApartmentSummary {
  const said = (pattern: RegExp) => apartment.features.some((feature) => pattern.test(feature));
  const features: ApartmentSummary["features"] = [
    ...(said(/kitchenette|kitchen/i) ? [{ label: "Kitchenette", icon: "kitchen" as const }] : []),
    ...(/private/i.test(apartment.bathroom) ? [{ label: "Private bathroom", icon: "bath" as const }] : []),
    ...(said(/wi-?fi/i) ? [{ label: "Wi-Fi", icon: "wifi" as const }] : []),
  ];
  return {
    name: apartment.name,
    href: apartmentPath(apartment.slug),
    summary: apartment.summary,
    sleeps: apartment.sleeps,
    beds: apartment.beds,
    photo: apartment.photos[0] ?? null,
    confirmed: apartment.confirmed,
    features,
    price: fromCents === null ? null : fromPriceLabel(fromCents),
  };
}

/** "From R850 a night": an apartment's nightly rate, before seasons and extra guests. */
export function fromPriceLabel(cents: number): string {
  return `From ${formatCents(cents)} a night`;
}
