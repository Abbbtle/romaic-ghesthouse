/**
 * Facts the holding page and the design preview show, each from the client's
 * own brand guide (Edition 1, November 2026) or posters, supplied on
 * 2026-11-12 (docs/planning/brand-guide-notes.md). Phase 2 moves them into
 * editable content (the "site" and "contact" sections); until then they live
 * here, in one place.
 *
 * Solar backup power is deliberately absent: only the Booking.com listing
 * claims it, and the client's materials don't.
 */
export const romaicFacts = {
  name: "Romaic Guesthouse",
  addressLine: "286 Stateway, Bedelia, Welkom",
  address: { street: "286 Stateway", area: "Bedelia", town: "Welkom", province: "Free State", country: "South Africa" },
  phone: { e164: "+27769579928", display: "+27 76 957 9928", tel: "tel:+27769579928" },
  whatsapp: "https://wa.me/27769579928",
  email: "guesthouseromaic@gmail.com",
} as const;

export type AmenityIcon =
  | "apartment"
  | "coffee"
  | "water"
  | "geyser"
  | "wifi"
  | "fence"
  | "camera"
  | "enclosed"
  | "tank"
  | "microwave"
  | "iron"
  | "walk"
  | "parking";

export type AmenityGroup = { title: string; items: readonly { label: string; icon: AmenityIcon }[] };

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
