import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import type { SiteContent } from "@/lib/content/schema";
import { contentService } from "./content";

/**
 * All of the site's editable content, read once per request: layouts, pages
 * and generateMetadata can call it as often as they like, and only the first
 * call in a request reads the store. `connection()` keeps it out of the
 * build: content changes in the dashboard at any time, so it's never baked
 * into a prerendered page (SPEC §5.1). A stored section that no longer
 * validates comes back as its default, so the public site always renders.
 */
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  await connection();
  return contentService().getAll();
});
