import { MotionGate } from "@/components/site/motion-gate";
import { SiteDock } from "@/components/site/site-dock";
import { siteFactsOf } from "@/components/site/site-facts";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { footerNav, mainNav } from "@/components/site/site-nav";
import { sitePagePaths } from "@/lib/content/pages";
import { getSiteContent } from "@/server/site-content";

/**
 * The public site's content can change in the dashboard at any moment and
 * must be live straight away, without a redeploy, so every public page is
 * rendered per request with the content as it is now (read once per
 * request; see getSiteContent). This tells Next not to expect a static
 * shell for these pages.
 */
export const instant = false;

/**
 * The public site's frame: the header with the main pages and the booking
 * action, then the page, then the footer ending in the navy contact bar, and
 * on phones the booking dock. The business's name, phone, email and address
 * come from content.
 */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const content = await getSiteContent();
  const facts = siteFactsOf(content);
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <MotionGate />
      <SiteHeader links={mainNav} bookHref={sitePagePaths.book} facts={facts} />
      {children}
      <SiteFooter links={footerNav} facts={facts} />
      <SiteDock facts={facts} />
    </div>
  );
}
