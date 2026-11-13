import type { Facility, FacilitiesSection } from "@/lib/content/schema";

/**
 * What the guesthouse offers. The first four groups are the client's own,
 * in the brand guide's order and grouping (p9), so they're confirmed. The
 * last group comes from the Booking.com listing's facilities checklist
 * (host-entered, read 2026-11-12; property-facts.md) and is marked "To
 * confirm" until the owner checks it. Solar backup power is left out: only
 * the listing claims it.
 */
const confirmed = (icon: Facility["icon"], label: string): Facility => ({ icon, label, note: "", confirmed: true });
const toConfirm = (icon: Facility["icon"], label: string, note = ""): Facility => ({ icon, label, note, confirmed: false });

export const facilitiesDefaults: FacilitiesSection = {
  heading: "Facilities",
  intro: "What you'll find at the guesthouse and in your room. If there's something you need that isn't listed, ask us.",
  groups: [
    {
      title: "Comfort",
      items: [
        confirmed("apartment", "Spacious rooms with kitchenettes"),
        confirmed("coffee", "Coffee, tea and cookies"),
        confirmed("water", "3 L of drinking water"),
        confirmed("geyser", "Backup gas geysers"),
      ],
    },
    { title: "Connectivity", items: [confirmed("wifi", "Fast Wi-Fi, always online")] },
    {
      title: "Security",
      items: [
        confirmed("fence", "Electric fence"),
        confirmed("camera", "Security cameras"),
        confirmed("enclosed", "Safe, enclosed property"),
        confirmed("tank", "Two JoJo tanks for backup water"),
      ],
    },
    {
      title: "Convenience",
      items: [
        confirmed("microwave", "Microwave and fridge"),
        confirmed("iron", "Iron and ironing board"),
        confirmed("walk", "Walking distance to the CBD"),
        confirmed("parking", "Enclosed parking"),
      ],
    },
    {
      title: "Also at the guesthouse",
      items: [
        toConfirm("garden", "Garden"),
        toConfirm("braai", "Braai area with outdoor furniture"),
        toConfirm("housekeeping", "Daily housekeeping"),
        toConfirm("laundry", "Laundry and ironing service", "At an extra charge"),
        toConfirm("invoice", "Invoices for your stay"),
        toConfirm("key", "Private check-in and check-out"),
        toConfirm("family", "Board games, puzzles, and books and DVDs for children"),
        toConfirm("accessible", "A wheelchair-accessible room"),
        toConfirm("no-smoking", "Non-smoking throughout"),
      ],
    },
  ],
};
