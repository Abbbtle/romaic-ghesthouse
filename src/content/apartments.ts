import type { Apartment, ApartmentsSection } from "@/lib/content/schema";
import { standIns } from "./stand-ins";

/**
 * The seven apartment types, from the Booking.com listing's room panels
 * (read 2026-11-12; docs/planning/property-facts.md), in our own words. The
 * client calls them apartments, so the listing's "Room" names are renamed.
 * Every one is `confirmed: false`, so the site marks its details "To
 * confirm" until the owner checks them. Left out on purpose:
 * - sizes: the listing shows the same 108 ft² for every type, which looks
 *   like an unfilled default;
 * - prices: none are sourced (rates arrive in Phase 3);
 * - how many units each type has (open question #7).
 * Photos are labelled stand-ins.
 */

/** In every room panel on the listing [R]; the client's brand guide confirms the fridge, microwave, iron and Wi-Fi. */
const everyApartment = [
  "Kitchenette with fridge, microwave and kettle",
  "Tea and coffee maker",
  "Desk and seating area",
  "Flat-screen TV",
  "Iron and ironing board",
  "Wardrobe or clothes rack",
  "Free Wi-Fi",
  "Towels",
] as const;

function apartment(fields: Omit<Apartment, "confirmed" | "published" | "description" | "accessibility" | "view"> & Partial<Apartment>): Apartment {
  return { description: "", accessibility: "", view: "", confirmed: false, published: true, ...fields };
}

export const apartmentsDefaults: ApartmentsSection = {
  heading: "Apartments",
  intro:
    "Every apartment comes with a fridge and microwave, an iron and ironing board, coffee, tea and cookies, drinking water and fast Wi-Fi. Choose the one that fits your group.",
  items: [
    apartment({
      slug: "accessible-family",
      name: "Accessible family apartment",
      summary: "Wheelchair accessible, with grab rails beside the toilet, a kitchenette and beds for three.",
      description:
        "Our accessible apartment has a large double bed and a single bed, a kitchenette, a sofa and outdoor furniture, and a private bathroom with a shower and grab rails beside the toilet.",
      sleeps: 3,
      beds: "1 single and 1 large double",
      bathroom: "Private, with a shower and grab rails beside the toilet",
      features: [...everyApartment, "Sofa", "Outdoor furniture", "Mosquito net", "Fan"],
      accessibility:
        "Listed as wheelchair accessible throughout, with grab rails beside the toilet. Still to be confirmed with the owner: whether the way from the parking is step-free, the door widths, and whether the shower is step-free.",
      photos: [standIns.doubleBed, standIns.shower],
    }),
    apartment({
      slug: "family-shower",
      name: "Family apartment with shower",
      summary: "Our largest: beds for up to five, a kitchenette and a private bathroom.",
      sleeps: 5,
      beds: "5 single, or 3 single and 1 extra-large double",
      bathroom: "Private, with a shower",
      features: [...everyApartment, "Outdoor furniture"],
      photos: [standIns.twinBeds, standIns.shower],
    }),
    apartment({
      slug: "double-extra-bed",
      name: "Double apartment with extra bed",
      summary: "Beds for four, with a sofa, a kitchenette and a private bathroom.",
      sleeps: 4,
      beds: "2 single and 1 extra-large double, or 4 single",
      bathroom: "Private bathroom",
      features: [...everyApartment, "Sofa", "Toaster", "Mosquito net"],
      photos: [standIns.seatingCorner, standIns.deskBedroom],
    }),
    apartment({
      slug: "deluxe-double-bath",
      name: "Deluxe double apartment with bath",
      summary: "A large double bed and a bathroom with both a bath and a shower, looking onto the inner courtyard.",
      sleeps: 2,
      beds: "1 large double",
      bathroom: "Private, with a bath and a shower",
      view: "Inner courtyard",
      features: [...everyApartment],
      photos: [standIns.redBedding, standIns.bathtub],
    }),
    apartment({
      slug: "deluxe-double-extra-bed",
      name: "Deluxe double apartment with extra bed",
      summary: "A large double and a single bed, a sofa and outdoor furniture, looking onto the inner courtyard.",
      sleeps: 3,
      beds: "1 single and 1 large double",
      bathroom: "Private bathroom",
      view: "Inner courtyard",
      features: [...everyApartment, "Sofa", "Outdoor furniture"],
      photos: [standIns.warmBedroom, standIns.seatingCorner],
    }),
    apartment({
      slug: "double-twin-shower",
      name: "Double or twin apartment with shower",
      summary: "One extra-large double or two singles, looking onto the inner courtyard.",
      sleeps: 2,
      beds: "1 extra-large double, or 2 single",
      bathroom: "Private, with a shower",
      view: "Inner courtyard",
      features: [...everyApartment],
      photos: [standIns.deskBedroom, standIns.shower],
    }),
    apartment({
      slug: "deluxe-double-shower",
      name: "Deluxe double apartment with shower",
      summary: "A large double and a single bed, a sofa, a kitchenette and a private bathroom with a shower.",
      sleeps: 2,
      beds: "1 single and 1 large double",
      bathroom: "Private, with a shower",
      features: [...everyApartment, "Sofa"],
      photos: [standIns.doubleBed, standIns.coffeeTray],
    }),
  ],
};
