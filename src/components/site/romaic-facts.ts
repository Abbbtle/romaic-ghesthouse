import type { ContentIcon } from "@/lib/content/schema";
import type { SiteFacts } from "./site-facts";

/**
 * The business facts as the client's brand guide (Edition 1, November 2026)
 * and posters give them (docs/planning/brand-guide-notes.md). Public pages
 * read the editable versions from content (siteFactsOf); these are only for
 * the places that can't: the error screens, which must render even when the
 * database can't be reached, and the /kit design preview.
 *
 * Solar backup power is deliberately absent: only the Booking.com listing
 * claims it, and the client's materials don't.
 */
export const romaicFacts: SiteFacts = {
  name: "Romaic Guesthouse",
  addressLine: "286 Stateway, Bedelia, Welkom",
  areaLine: "Bedelia, Welkom",
  phone: { e164: "+27769579928", display: "+27 76 957 9928", tel: "tel:+27769579928" },
  whatsapp: "https://wa.me/27769579928",
  whatsappNumber: "+27769579928",
  email: "guesthouseromaic@gmail.com",
  mapLink: `https://maps.google.com/?q=${encodeURIComponent("286 Stateway, Bedelia, Welkom, Free State")}`,
};

/** The amenity icons are content's curated icons. */
export type AmenityIcon = ContentIcon;

export type AmenityGroup = {
  title: string;
  items: readonly { label: string; icon: AmenityIcon; note?: string; confirmed?: boolean }[];
};

/** The brand guide's four groups (p9), in its order, reworded only into sentence case. */
export const amenityGroups: readonly AmenityGroup[] = [
  {
    title: "Comfort",
    items: [
      { label: "Spacious apartments", icon: "apartment" },
      { label: "Coffee, tea and cookies", icon: "coffee" },
      { label: "3 L of drinking water", icon: "water" },
      { label: "Backup gas geysers", icon: "geyser" },
    ],
  },
  {
    title: "Connectivity",
    items: [{ label: "Fast Wi-Fi, always online", icon: "wifi" }],
  },
  {
    title: "Security",
    items: [
      { label: "Electric fence", icon: "fence" },
      { label: "Security cameras", icon: "camera" },
      { label: "Safe, enclosed property", icon: "enclosed" },
      { label: "Two JoJo tanks for backup water", icon: "tank" },
    ],
  },
  {
    title: "Convenience",
    items: [
      { label: "Microwave and fridge", icon: "microwave" },
      { label: "Iron and ironing board", icon: "iron" },
      { label: "Walking distance to the CBD", icon: "walk" },
      { label: "Enclosed parking", icon: "parking" },
    ],
  },
];
