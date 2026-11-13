import type { Metadata } from "next";
import { sitePagePaths, type SitePage } from "@/lib/content/pages";
import { getSiteContent } from "@/server/site-content";

/**
 * A page's title, description, canonical address and social preview, from
 * the "Search results" content. Titles are complete as the owner wrote them
 * (no suffix is added).
 */
export async function pageMetadata(page: SitePage): Promise<Metadata> {
  const { seo } = await getSiteContent();
  const { title, description } = seo.pages[page];
  const path = sitePagePaths[page];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}
