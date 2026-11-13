import { sitePagePaths } from "@/lib/content/pages";
import type { SiteNavLink } from "./mobile-menu";

/** The main pages, in the header and the phone menu. */
export const mainNav: readonly SiteNavLink[] = [
  { href: sitePagePaths.apartments, label: "Apartments" },
  { href: sitePagePaths.facilities, label: "Facilities" },
  { href: sitePagePaths.location, label: "Location" },
  { href: sitePagePaths.gallery, label: "Gallery" },
  { href: sitePagePaths.policies, label: "House rules" },
  { href: sitePagePaths.contact, label: "Contact" },
];

/** The footer's links: the pages, booking and the privacy notice. */
export const footerNav: readonly SiteNavLink[] = [
  ...mainNav,
  { href: sitePagePaths.book, label: "Book" },
  { href: sitePagePaths.privacy, label: "Privacy notice" },
];
