import Link from "next/link";
import { CurrentYear } from "@/components/ui/current-year";
import { ContactBar } from "./contact-bar";
import type { SiteNavLink } from "./mobile-menu";
import type { SiteFacts } from "./site-facts";

/**
 * The foot of every public page: the pages and the legal links on Cream,
 * then the navy contact bar at the very bottom edge, as the brand guide
 * places it. The dock-height padding keeps the bar clear of the phone
 * booking dock where a page shows one.
 */
export function SiteFooter({ facts, links = [], withDock = false }: { facts: SiteFacts; links?: readonly SiteNavLink[]; withDock?: boolean }) {
  return (
    <footer className={withDock ? "pb-[calc(var(--dock-height)+env(safe-area-inset-bottom))] lg:pb-0" : undefined}>
      <div className="border-t border-hairline bg-cream">
        <div className="mx-auto grid max-w-page gap-6 px-[max(1rem,env(safe-area-inset-left))] py-8 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1 text-sm text-fg-2">
            {/* Plain text: the brand guide (p4) forbids retyping the wordmark, so the name never imitates it. */}
            <p className="text-base font-bold text-ink">{facts.name}</p>
            <p>{facts.addressLine}</p>
            <p>
              © <CurrentYear /> {facts.name}
            </p>
          </div>
          {links.length > 0 && (
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="quiet-link inline-flex min-h-11 items-center">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
      <ContactBar facts={facts} />
    </footer>
  );
}
