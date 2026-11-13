import { MotionGate } from "@/components/site/motion-gate";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * The public site's frame. In Phase 1 it holds the holding page only, so the
 * header carries the logo slot without navigation; Phase 2 adds the pages,
 * their links and the booking action. Nothing here reads the database.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="theme-site flex min-h-svh flex-col bg-canvas">
      <MotionGate />
      <SiteHeader />
      {children}
      <SiteFooter withDock />
    </div>
  );
}
