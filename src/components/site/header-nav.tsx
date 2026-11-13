"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SiteNavLink } from "./mobile-menu";

/** Whether `href` is the page shown, or the section it's in (an apartment's page is in Apartments). */
export function isCurrent(href: string, pathname: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/** The header's page links from 1280 px, the current one underlined in gold and announced as the current page. */
export function HeaderNav({ links }: { links: readonly SiteNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden xl:block">
      <ul className="flex items-center gap-6">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
              className="inline-flex min-h-11 items-center font-display text-sm font-semibold tracking-[0.14em] whitespace-nowrap text-ink uppercase decoration-2 underline-offset-[0.4em] hover:text-gold-text hover:underline aria-[current=page]:underline aria-[current=page]:decoration-romaic-gold"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
