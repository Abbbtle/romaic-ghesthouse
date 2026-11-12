/**
 * The public pages that content belongs to. Search settings name a page by
 * its key, never by a typed address. Each apartment also has a page of its
 * own (/apartments/<link name>), titled from the apartment itself, and the
 * booking confirmation is never indexed, so neither is listed here.
 */

export const sitePages = ["home", "apartments", "gallery", "facilities", "location", "policies", "contact", "book", "privacy"] as const;

export type SitePage = (typeof sitePages)[number];

export const sitePagePaths: Record<SitePage, string> = {
  home: "/",
  apartments: "/apartments",
  gallery: "/gallery",
  facilities: "/facilities",
  location: "/location",
  policies: "/policies",
  contact: "/contact",
  book: "/book",
  privacy: "/privacy",
};

export const sitePageNames: Record<SitePage, string> = {
  home: "Home",
  apartments: "Apartments",
  gallery: "Gallery",
  facilities: "Facilities",
  location: "Location and area",
  policies: "Policies",
  contact: "Contact",
  book: "Book",
  privacy: "Privacy notice",
};

/** An apartment's own page. */
export function apartmentPath(slug: string): string {
  return `/apartments/${slug}`;
}

export function isSitePage(value: unknown): value is SitePage {
  return typeof value === "string" && (sitePages as readonly string[]).includes(value);
}
