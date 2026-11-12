import type { SiteContent } from "@/lib/content/schema";
import { apartmentsDefaults } from "./apartments";
import { bookDefaults } from "./book";
import { bookingTermsDefaults } from "./booking-terms";
import { contactDefaults } from "./contact";
import { contactPageDefaults } from "./contact-page";
import { facilitiesDefaults } from "./facilities";
import { galleryDefaults } from "./gallery";
import { homeDefaults } from "./home";
import { locationDefaults } from "./location";
import { policiesDefaults } from "./policies";
import { privacyDefaults } from "./privacy";
import { seoDefaults } from "./seo";
import { siteDefaults } from "./site";

/**
 * Romaic's content as the site starts with it, from sourced facts only (the
 * client's brand guide and posters, and the Booking.com listing where a
 * file says so, marked "To confirm"). The content service stores it the
 * first time it runs; after that the dashboard is the source of truth and
 * this file isn't read again for sections already stored.
 */
export const contentDefaults: SiteContent = {
  site: siteDefaults,
  contact: contactDefaults,
  bookingTerms: bookingTermsDefaults,
  home: homeDefaults,
  apartments: apartmentsDefaults,
  gallery: galleryDefaults,
  facilities: facilitiesDefaults,
  location: locationDefaults,
  policies: policiesDefaults,
  contactPage: contactPageDefaults,
  book: bookDefaults,
  seo: seoDefaults,
  privacy: privacyDefaults,
};
