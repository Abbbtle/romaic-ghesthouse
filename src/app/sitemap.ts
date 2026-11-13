import type { MetadataRoute } from "next";
import { apartmentPath, sitePagePaths, sitePages } from "@/lib/content/pages";
import { env } from "@/server/env";
import { getSiteContent } from "@/server/site-content";

/**
 * Every public page, and every room type shown on the site, at the site's
 * public address. Read per request, so a room added or hidden in the
 * dashboard appears or goes at once. The booking confirmation isn't listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl();
  const { apartments } = await getSiteContent();
  const pages = sitePages.map((page) => sitePagePaths[page]);
  const apartmentPages = apartments.items.filter((item) => item.published).map((item) => apartmentPath(item.slug));
  return [...pages, ...apartmentPages].map((path) => ({ url: new URL(path, base).toString() }));
}
