import type { SiteContent } from "@/lib/content/schema";
import { contactDefaults } from "./contact";
import { privacyDefaults } from "./privacy";
import { seoDefaults } from "./seo";
import { siteDefaults } from "./site";

/**
 * Romaic's content as the site starts with it, from sourced facts only (the
 * client's brand guide and posters, and the Booking.com listing where a
 * file says so). The content service stores it the first time it runs;
 * after that the dashboard is the source of truth and this file isn't read
 * again for sections already stored.
 */
export const contentDefaults: SiteContent = {
  site: siteDefaults,
  contact: contactDefaults,
  seo: seoDefaults,
  privacy: privacyDefaults,
};
