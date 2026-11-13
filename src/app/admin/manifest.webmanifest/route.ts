import { adminManifest } from "@/components/admin/admin-manifest";

/**
 * The installable dashboard's web-app manifest, at /admin/manifest.webmanifest
 * (Next.js's manifest file convention only works at the site's root). It's
 * the same for every request, so it's made at build time.
 */
export function GET(): Response {
  return new Response(JSON.stringify(adminManifest()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
