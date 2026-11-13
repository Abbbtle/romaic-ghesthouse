import type { Metadata } from "next";
import { romaicFacts } from "@/components/site/romaic-facts";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { footerNav, mainNav } from "@/components/site/site-nav";
import { NotFoundView } from "@/components/site/status-views";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Addresses that lead nowhere. This renders inside the root layout only, so
 * it brings the site's header and footer itself, with the brand guide's
 * contact details: nothing here reads the database, so it renders even when
 * that's down. (Pages that call notFound() use (site)/not-found.tsx, inside
 * the site's own frame.)
 */
export default function NotFound() {
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <SiteHeader links={mainNav} bookHref="/book" facts={romaicFacts} />
      <main id="main" className="flex flex-1 items-center">
        <NotFoundView />
      </main>
      <SiteFooter links={footerNav} facts={romaicFacts} />
    </div>
  );
}
