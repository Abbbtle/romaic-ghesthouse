import type { NextConfig } from "next";
import { baseSecurityHeaders, publicPolicy } from "./src/server/content-security-policy";

// This project sits inside the Weberu agency's own project folder. Pin the
// workspace root here so Next never resolves files or packages from the parent.
const projectRoot = __dirname;

const isProduction = process.env.NODE_ENV === "production";

// A client preview deployment (DESIGN_PREVIEW=1 at build time): the home page
// sends visitors to the /kit design preview, and search engines are asked not
// to index anything, until the real pages are built.
const isDesignPreview = process.env.DESIGN_PREVIEW === "1";

// The dashboard's own host (threat model D1), read at build time: with one set,
// the public host answers 404 for /admin and the dashboard host serves nothing
// but the dashboard, so no public page ever shares the dashboard's origin.
const adminHost = process.env.ADMIN_HOST?.trim() || null;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  outputFileTracingRoot: projectRoot,
  // PGlite (the local development database) loads its WebAssembly from its own
  // package folder, so it's required from node_modules, never bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      // Admin photo uploads are resized in the browser first; this leaves room
      // for a ~3.5 MB image plus form overhead, under Vercel's 4.5 MB body cap.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders(isProduction) },
      // Public pages: a fixed policy (the proxy gives dashboard responses a per-request nonce
      // policy instead). Development needs eval for fast refresh, so the CSP applies to builds.
      ...(isProduction ? [{ source: "/((?!admin(?:/|$)).*)", headers: [{ key: "Content-Security-Policy", value: publicPolicy() }] }] : []),
      ...(isDesignPreview ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : []),
      // Vercel's own addresses (the project's *.vercel.app name and every preview) are for
      // checking work, so search engines are asked to skip them.
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // The dashboard is never for search engines.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  async rewrites() {
    if (!adminHost) return [];
    return {
      beforeFiles: [
        // Public hosts: no dashboard.
        { source: "/admin", missing: [{ type: "host", value: adminHost }], destination: "/_not-found" },
        { source: "/admin/:path*", missing: [{ type: "host", value: adminHost }], destination: "/_not-found" },
        // The dashboard host: nothing but the dashboard, its assets and public images.
        { source: "/:path((?!admin|_next|media|favicon\\.ico).*)", has: [{ type: "host", value: adminHost }], destination: "/_not-found" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      ...(adminHost ? [{ source: "/", has: [{ type: "host" as const, value: adminHost }], destination: "/admin", permanent: false }] : []),
      ...(isDesignPreview ? [{ source: "/", destination: "/kit", permanent: false }] : []),
    ];
  },
};

export default nextConfig;
