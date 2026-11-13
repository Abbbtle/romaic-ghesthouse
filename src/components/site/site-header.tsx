import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { HeaderNav } from "./header-nav";
import { MobileMenu, type SiteNavLink } from "./mobile-menu";
import type { SiteFacts } from "./site-facts";

/**
 * The public header, one row on every screen: the business's name as a
 * plain wordmark in Josefin Sans (the client's logo files replace it when
 * they arrive; the brand forbids imitating the logo, so the name is set as
 * text, never as the logo's script lockup), the six page links, and the gold
 * "Check availability" button. It's navy on every page, and transparent over
 * the home page's photograph (`.site-header` in globals.css).
 *
 * The links need a laptop's width beside the name and the button, so they
 * show from 1200 px; below that the menu holds them. The gold button stays
 * from 560 px; below that the menu and the phone booking dock carry it.
 * With no links (an error page) it's the name alone.
 */
export function SiteHeader({
  links = [],
  bookHref,
  facts,
}: {
  links?: readonly SiteNavLink[];
  bookHref?: string;
  facts: Pick<SiteFacts, "name" | "phone" | "email" | "whatsapp">;
}) {
  return (
    <header className="site-header on-dark text-fg">
      <div className="site-wrap flex h-18 items-center justify-between gap-4 min-[56.25rem]:h-22">
        <Link
          href="/"
          className="min-w-0 font-display text-[1.0625rem] leading-none tracking-[0.04em] whitespace-nowrap text-fg min-[56.25rem]:text-xl"
        >
          {facts.name}
          <span className="sr-only">, home</span>
        </Link>
        {links.length > 0 && (
          <div className="flex items-center gap-x-8">
            <HeaderNav links={links} />
            {bookHref && (
              // The wrapper hides it on small phones: the button's own inline-flex would win over a "hidden" on the link itself.
              <span className="hidden min-[35rem]:block">
                <Link href={bookHref} className={buttonClasses({ variant: "gold", size: "md" }, "h-11.5")}>
                  Check availability
                </Link>
              </span>
            )}
            <MobileMenu links={links} facts={facts} bookHref={bookHref} />
          </div>
        )}
      </div>
    </header>
  );
}
