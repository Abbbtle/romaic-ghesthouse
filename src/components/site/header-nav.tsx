"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SiteNavLink } from "./mobile-menu";

/** Whether `href` is the page shown, or the section it's in (a room's page is in Rooms). */
export function isCurrent(href: string, pathname: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * The header's page links from 1200 px: Josefin Sans in sentence case on
 * navy, a gold hairline under the one hovered and under the current page,
 * which is also announced as the current page.
 */
export function HeaderNav({ links }: { links: readonly SiteNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden min-[75rem]:block">
      <ul className="flex items-center gap-7">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent(link.href, pathname) ? "page" : undefined}
              className="inline-flex min-h-11 items-center border-b border-transparent pt-px font-display text-nav tracking-[0.04em] whitespace-nowrap text-fg transition-colors duration-200 hover:border-romaic-gold aria-[current=page]:border-romaic-gold aria-[current=page]:text-romaic-gold"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
