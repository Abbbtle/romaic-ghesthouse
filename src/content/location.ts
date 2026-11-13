import type { LocationSection } from "@/lib/content/schema";

/**
 * Location and area. The address, "within walking distance of the CBD" and
 * the enclosed parking are the client's own (brand guide). The nearby places
 * and their distances are Booking.com's estimates for the listing ("shortest
 * estimated walking or driving distances", read 2026-11-12; property-facts.md),
 * converted to metric and marked "To confirm" until someone re-measures
 * them. Distances are rounded as the listing gave them, never improved.
 */
export const locationDefaults: LocationSection = {
  heading: "Location and area",
  intro: "We're at 286 Stateway in Bedelia, Welkom, within walking distance of the city centre.",
  directions: "There's spacious, enclosed parking inside the property. If you need directions on the way, WhatsApp or call us.",
  nearby: {
    heading: "Nearby",
    note: "Distances are estimates of the shortest walking or driving distance, still to be checked.",
    places: [
      { name: "Welkom city centre", kind: "City centre", distance: "Walking distance", confirmed: true },
      { name: "Nando's", kind: "Restaurant", distance: "About 320 m", confirmed: false },
      { name: "Far East Food Taiwanese Restaurant & Take Away", kind: "Restaurant", distance: "About 370 m", confirmed: false },
      { name: "Sietes Restaurant", kind: "Restaurant", distance: "About 590 m", confirmed: false },
      { name: "Welkom Train Station", kind: "Train station", distance: "About 3.5 km", confirmed: false },
    ],
  },
};
