import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { LogoSlot } from "@/components/ui/logo-slot";
import { HeaderNav } from "./header-nav";
import { MobileMenu, type SiteNavLink } from "./mobile-menu";
import type { SiteFacts } from "./site-facts";

/**
 * The public header: the logo (a placeholder slot until the client's files
 * arrive), the main pages, and the booking action. On phones the logo sits
 * centred, as on the poster, with the menu button beside it. The six page
 * links need the width of a laptop screen beside the logo's minimum size,
 * so they appear from 1280 px; below that, the menu holds them and the
 * booking button stays in reach from 1024 px. With no links (an error page)
 * it's the logo alone. Below 360 px the logo moves to the left and the empty
 * column that balanced the menu button goes, so the logo keeps its size and
 * nothing runs past a 320 px screen.
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
    <header className="border-b border-hairline bg-cream">
      <div className="mx-auto grid max-w-page grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 px-[max(0.75rem,env(safe-area-inset-left))] py-3 min-[360px]:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] min-[360px]:gap-3 min-[360px]:px-[max(1rem,env(safe-area-inset-left))] lg:flex lg:justify-between lg:py-4">
        <span aria-hidden="true" className="hidden min-[360px]:block lg:hidden" />
        <Link href="/" className="min-w-0 justify-self-start rounded-sm min-[360px]:justify-self-center">
          <LogoSlot kind="wordmark" decorative className="w-48 sm:w-60" />
          <span className="sr-only">{facts.name}, home</span>
        </Link>
        {links.length > 0 ? (
          <div className="flex items-center gap-6 justify-self-end">
            <HeaderNav links={links} />
            {bookHref && (
              // The wrapper hides it on phones: the button's own inline-flex would win over a "hidden" on the link itself.
              <span className="hidden lg:block">
                <Link href={bookHref} className={buttonClasses({ variant: "primary", size: "md" }, "whitespace-nowrap")}>
                  Check dates
                </Link>
              </span>
            )}
            <MobileMenu links={links} facts={facts} bookHref={bookHref} />
          </div>
        ) : (
          <span aria-hidden="true" className="lg:hidden" />
        )}
      </div>
    </header>
  );
}
