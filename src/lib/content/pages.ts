/**
 * The public pages that content belongs to. Search settings name a page by
 * its key, never by a typed address. Phase 1 has the home page (a holding
 * page until Phase 2) and the privacy notice; Phase 2 adds the apartments,
 * gallery, facilities, location, policies, contact and booking pages here.
 */

export const sitePages = ["home", "privacy"] as const;

export type SitePage = (typeof sitePages)[number];

export const sitePagePaths: Record<SitePage, string> = {
  home: "/",
  privacy: "/privacy",
};

export const sitePageNames: Record<SitePage, string> = {
  home: "Home",
  privacy: "Privacy notice",
};

export function isSitePage(value: unknown): value is SitePage {
  return typeof value === "string" && (sitePages as readonly string[]).includes(value);
}
