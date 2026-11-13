import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { LogoSlot } from "@/components/ui/logo-slot";
import { MobileMenu, type SiteNavLink } from "./mobile-menu";

/**
 * The public header: the logo (a placeholder slot until the client's files
 * arrive), the main pages, and the booking action. On phones the logo sits
 * centred, as on the poster, with the menu button beside it. With no links
 * (the holding page) it's the logo alone.
 */
export function SiteHeader({ links = [], bookHref }: { links?: readonly SiteNavLink[]; bookHref?: string }) {
  return (
    <header className="border-b border-hairline bg-cream">
      <div className="mx-auto grid max-w-page grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 lg:flex lg:justify-between lg:py-4">
        <span aria-hidden="true" className="lg:hidden" />
        <Link href="/" className="justify-self-center rounded-sm">
          <LogoSlot kind="wordmark" decorative className="w-48 sm:w-60" />
          <span className="sr-only">Romaic Guesthouse, home</span>
        </Link>
        {links.length > 0 ? (
          <>
            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-7">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center font-display text-sm font-semibold tracking-[0.14em] text-ink uppercase underline-offset-[0.4em] hover:text-gold-text hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex items-center gap-3 justify-self-end">
              {bookHref && (
                <Link href={bookHref} className={buttonClasses({ variant: "primary", size: "md" }, "hidden lg:inline-flex")}>
                  Check dates
                </Link>
              )}
              <MobileMenu links={links} />
            </div>
          </>
        ) : (
          <span aria-hidden="true" className="lg:hidden" />
        )}
      </div>
    </header>
  );
}
