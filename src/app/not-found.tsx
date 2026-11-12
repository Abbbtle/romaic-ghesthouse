import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { NotFoundView } from "@/components/site/status-views";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Unknown addresses, and pages that call notFound(). This renders inside the
 * root layout only, so it brings the site's header and footer itself. Nothing
 * here reads the database, so the page stays prerenderable.
 */
export default function NotFound() {
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center">
        <NotFoundView />
      </main>
      <SiteFooter />
    </div>
  );
}
