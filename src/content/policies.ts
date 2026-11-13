import type { PoliciesSection } from "@/lib/content/schema";

/**
 * Check-in and check-out times and the house rules, from the Booking.com
 * listing's house rules (host-entered, read 2026-11-12; property-facts.md),
 * in our own words. The listing's rules are for Booking.com stays; nobody
 * has said yet whether direct bookings follow them, so every one is marked
 * "To confirm" until the owner checks it (open question #12).
 */
export const policiesDefaults: PoliciesSection = {
  heading: "House rules",
  intro: "Please read these before you book. If anything isn't clear, ask us.",
  checkIn: { from: "15:00", until: "21:00", confirmed: false },
  checkOut: { from: "05:00", until: "10:00", confirmed: false },
  rules: [
    { title: "Children", text: "Children of any age are welcome. From the age of 9, children count as adults.", confirmed: false },
    {
      title: "Cots and extra beds",
      text: "We don't have cots or extra beds. The extra bed in some rooms' names is a permanent bed in the room.",
      confirmed: false,
    },
    { title: "Pets", text: "Pets aren't allowed.", confirmed: false },
    { title: "Smoking", text: "Smoking isn't allowed anywhere at the guesthouse.", confirmed: false },
    { title: "Parties", text: "Parties and events aren't allowed.", confirmed: false },
    { title: "Quiet hours", text: "Please keep noise down between 22:00 and 07:00.", confirmed: false },
  ],
};
