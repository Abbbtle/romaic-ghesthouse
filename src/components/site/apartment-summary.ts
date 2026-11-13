import { apartmentPath } from "@/lib/content/pages";
import type { Apartment } from "@/lib/content/schema";
import type { ApartmentSummary } from "./apartment-card";

/**
 * An apartment from the site's content as its card shows it. The card's
 * three short facts are read from the apartment's own words (a kitchenette
 * among its features, a private bathroom, Wi-Fi), so they can't claim
 * anything the apartment's details don't. Prices arrive with rates (Phase
 * 3); until then every card says "Price on request".
 */
export function apartmentSummaryOf(apartment: Apartment): ApartmentSummary {
  const said = (pattern: RegExp) => apartment.features.some((feature) => pattern.test(feature));
  const features: ApartmentSummary["features"] = [
    ...(said(/kitchenette|kitchen/i) ? [{ label: "Kitchenette", icon: "kitchen" as const }] : []),
    ...(/private/i.test(apartment.bathroom) ? [{ label: "Private bathroom", icon: "bath" as const }] : []),
    ...(said(/wi-?fi/i) ? [{ label: "Wi-Fi", icon: "wifi" as const }] : []),
  ];
  return {
    name: apartment.name,
    href: apartmentPath(apartment.slug),
    sleeps: apartment.sleeps,
    beds: apartment.beds,
    photo: apartment.photos[0] ?? null,
    confirmed: apartment.confirmed,
    features,
    price: null,
  };
}
