import type { HomeSection } from "@/lib/content/schema";
import { standIns } from "./stand-ins";

/**
 * The home page as it starts. Every fact is the client's own, from the brand
 * guide (Edition 1, November 2026) and posters (docs/planning/brand-guide-notes.md):
 * the headline, walking distance to the city centre, what's in each
 * apartment, the backup water and gas geysers, the fence, cameras and
 * enclosed parking. Solar backup power is left out: only the Booking.com
 * listing claims it. The photo is a labelled stand-in.
 */
export const homeDefaults: HomeSection = {
  hero: {
    headline: "Spacious apartments in Welkom",
    lead: "Within walking distance of the city centre. Fast Wi-Fi that's always online, self-catering essentials, and backup water and hot water, inside a secure, enclosed property with parking.",
    welcome: "Welcome home",
    photo: standIns.warmBedroom,
  },
  apartments: {
    heading: "Our apartments",
    intro: "Every apartment comes with a fridge and microwave, an iron and ironing board, coffee, tea and cookies, drinking water and fast Wi-Fi.",
  },
  highlights: {
    heading: "What keeps working",
    intro: "Backup water and hot water, Wi-Fi that stays on, and a property that's fenced, watched by cameras and enclosed.",
    items: [
      {
        icon: "bed",
        title: "In your apartment",
        lines: ["Fridge, microwave, iron and ironing board", "3 L of drinking water, coffee, tea and cookies"],
      },
      {
        icon: "wifi",
        title: "Connectivity and water",
        lines: ["Fast, always-on Wi-Fi", "Backup gas water heaters and two JoJo water tanks"],
      },
      {
        icon: "parking",
        title: "Parking and security",
        lines: ["Spacious enclosed parking, electric fencing and security cameras"],
      },
    ],
  },
  location: {
    heading: "Where to find us",
    text: "In Bedelia, a short walk from Welkom's city centre, with enclosed parking on the property.",
  },
};
