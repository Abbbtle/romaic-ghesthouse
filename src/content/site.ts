import type { SiteSection } from "@/lib/content/schema";

/**
 * Business details as the site starts with them. Sources:
 * - name, address and description: the client's brand guide (Romaic
 *   Guesthouse Brand Guide, Edition 1, November 2026: "Spacious apartments
 *   at 286 Stateway, Bedelia, Welkom — within walking distance of the CBD")
 *   and its posters (docs/planning/brand-guide-notes.md), with the client's
 *   correction that Romaic is a guesthouse with rooms, never apartments;
 * - province: Booking.com's breadcrumb for the listing (South Africa › Free
 *   State › Welkom), docs/planning/property-facts.md.
 *
 * Left empty until the client gives them: the postal code (only the
 * Booking.com listing shows one, unconfirmed), social links (none supplied)
 * and the footer credit (Weberu's call).
 */
export const siteDefaults: SiteSection = {
  businessName: "Romaic Guesthouse",
  description: "A secure guesthouse in Bedelia, Welkom, within walking distance of the CBD.",
  address: {
    street: "286 Stateway",
    area: "Bedelia",
    city: "Welkom",
    province: "Free State",
    postalCode: "",
    mapUrl: null,
  },
  socialLinks: [],
  footerCredit: null,
};
