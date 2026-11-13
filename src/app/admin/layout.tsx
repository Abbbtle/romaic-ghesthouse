import type { Metadata } from "next";
import { connection } from "next/server";
import { adminManifestPath } from "@/components/admin/admin-manifest";

/**
 * Every dashboard page depends on who's signed in, so none of it can be
 * prerendered. This lets its pages read the session before they render
 * instead of streaming behind a loading state.
 */
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Romaic dashboard", template: "%s · Romaic dashboard" },
  robots: { index: false, follow: false },
  // The installable dashboard: "Add to Home Screen" from any of its pages opens Today, like an app.
  manifest: adminManifestPath,
  appleWebApp: { capable: true, title: "Romaic dashboard", statusBarStyle: "default" },
};

/**
 * Waits for the request before rendering anything, so no dashboard page (not
 * even a static one like "Forgot password") is prerendered. Each response is
 * rendered with the proxy's per-request CSP nonce on every script: a
 * prerendered shell can't carry one, and the strict policy would block its
 * scripts (found in the Phase 1 CSP spike).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  return children;
}
