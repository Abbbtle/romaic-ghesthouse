import type { MetadataRoute } from "next";
import { sitePagePaths, type SitePage } from "@/lib/content/pages";
import { env } from "@/server/env";

/** The public pages built so far (Phase 1 has only the holding page; Phase 2 adds the rest). */
const builtPages: readonly SitePage[] = ["home"];

/** Every public page that exists, at the site's public address. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl();
  return builtPages.map((page) => ({ url: new URL(sitePagePaths[page], base).toString() }));
}
