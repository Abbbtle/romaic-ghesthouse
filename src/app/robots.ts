import type { MetadataRoute } from "next";
import { env } from "@/server/env";

/**
 * Crawlers may read the public site; the dashboard, the JSON endpoints and
 * the design preview are off limits (the dashboard also says noindex). A
 * client design preview (DESIGN_PREVIEW=1) is kept out of search entirely.
 */
export default function robots(): MetadataRoute.Robots {
  if (env.isDesignPreview()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/kit"] },
    sitemap: new URL("/sitemap.xml", env.siteUrl()).toString(),
  };
}
