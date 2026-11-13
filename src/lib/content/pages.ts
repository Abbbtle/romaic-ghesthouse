/**
 * The public pages that content belongs to. Search settings name a page by
 * its key, never by a typed address. Each room type also has a page of its
 * own (/rooms/<link name>), titled from the room itself, and the booking
 * confirmation is never indexed, so neither is listed here.
 *
 * The rooms page keeps the key `apartments` (stored search settings name it),
 * but its address is /rooms; the old /apartments addresses are in
 * `movedPages` below.
 */

export const sitePages = ["home", "apartments", "gallery", "facilities", "location", "policies", "contact", "book", "privacy"] as const;

export type SitePage = (typeof sitePages)[number];

export const sitePagePaths: Record<SitePage, string> = {
  home: "/",
  apartments: "/rooms",
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
  apartments: "Rooms",
  gallery: "Gallery",
  facilities: "Facilities",
  location: "Location and area",
  policies: "Policies",
  contact: "Contact",
  book: "Book",
  privacy: "Privacy notice",
};

/** A room type's own page. */
export function apartmentPath(slug: string): string {
  return `/rooms/${slug}`;
}

/**
 * Addresses the site has used before, and where those pages are now. The
 * rooms were once listed at /apartments, and links and search results may
 * still use those addresses, so next.config.ts sends each one here with a
 * permanent (308) redirect. The query string goes along with it.
 */
export const movedPages: readonly { source: string; destination: string }[] = [
  { source: "/apartments", destination: sitePagePaths.apartments },
  { source: "/apartments/:slug", destination: apartmentPath(":slug") },
];

export function isSitePage(value: unknown): value is SitePage {
  return typeof value === "string" && (sitePages as readonly string[]).includes(value);
}
