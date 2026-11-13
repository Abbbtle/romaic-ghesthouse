"use client";

import {
  ArrowUpRight,
  BedDouble,
  CircleUserRound,
  Ellipsis,
  House,
  Inbox,
  LogOut,
  MessageCircle,
  PenLine,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Sheet } from "@/components/ui/sheet";
import { newTabHint, VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { badgeText, isCurrentAdminPath, type AdminBadges, type AdminNavItem, type AdminSection } from "./admin-routes";

const glyphs: Record<AdminSection | "account", LucideIcon> = {
  today: House,
  requests: Inbox,
  content: PenLine,
  apartments: BedDouble,
  team: Users,
  audit: ScrollText,
  account: CircleUserRound,
};

function NavIcon({ icon, className }: { icon: AdminSection | "account"; className: string }) {
  return createElement(glyphs[icon], { "aria-hidden": true, strokeWidth: 1.75, className });
}

/** Who is signed in, and where their account page is. */
export type AdminAccount = { name: string; roleLabel: string; href: string };

/** Signs the person out: a server action, used as a form action. */
export type SignOutAction = (formData: FormData) => void | Promise<void>;

/** The spoken end of a badged item's name: ", 2 waiting". */
function BadgeDescription({ count, label }: { count: number; label?: string }) {
  return <VisuallyHidden>{`, ${count}${label ? ` ${label}` : ""}`}</VisuallyHidden>;
}

const badgeClasses =
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-600 px-[5px] text-xs leading-none font-medium text-white tabular-nums";

type NavViewProps = {
  items: readonly AdminNavItem[];
  badges?: AdminBadges;
  /** The current path, or null while it isn't known. */
  pathname: string | null;
};

/** The sidebar's sections from 1024 px: 44 px rows; the current one on pale green with a 3 px bar. */
export function SidebarNavView({ items, badges = {}, pathname }: NavViewProps) {
  const groups = [items.filter((item) => item.group === "primary"), items.filter((item) => item.group === "secondary")];
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3">
      {groups.map(
        (group, index) =>
          group.length > 0 && (
            <ul key={index} className="grid gap-0.5">
              {group.map((item) => {
                const count = badges[item.section] ?? 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isCurrentAdminPath(item.href, pathname) ? "page" : undefined}
                      className="relative flex h-11 items-center gap-3 rounded-sm px-3 text-base font-medium text-fg-2 transition-colors duration-150 hover:bg-chalk hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:font-semibold aria-[current=page]:text-primary aria-[current=page]:[&>svg]:text-gold-text"
                    >
                      <NavIcon icon={item.section} className="size-5 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <>
                          <span aria-hidden="true" className={badgeClasses}>
                            {badgeText(count)}
                          </span>
                          <BadgeDescription count={count} label={item.badgeLabel} />
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ),
      )}
    </nav>
  );
}

/** The sidebar's sections, marking the current page. */
export function SidebarNav(props: Omit<NavViewProps, "pathname">) {
  return <SidebarNavView {...props} pathname={usePathname()} />;
}

const tabClasses =
  "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium text-fg-2 transition-colors duration-150 aria-[current=page]:text-primary data-active:text-primary aria-[current=page]:before:absolute aria-[current=page]:before:inset-x-[22%] aria-[current=page]:before:top-0 aria-[current=page]:before:h-[3px] aria-[current=page]:before:rounded-b-xs aria-[current=page]:before:bg-romaic-gold data-active:before:absolute data-active:before:inset-x-[22%] data-active:before:top-0 data-active:before:h-[3px] data-active:before:rounded-b-xs data-active:before:bg-romaic-gold";

const sheetRowClasses = "flex min-h-14 w-full items-center gap-3 px-4 text-base font-medium text-fg transition-colors hover:bg-chalk";

type TabBarViewProps = NavViewProps & {
  account: AdminAccount;
  viewSiteHref: string;
  /** A WhatsApp link to the agency, as "Get help from Weberu". */
  helpHref?: string;
  signOutAction: SignOutAction;
};

/**
 * The phone tab bar below 1024 px (design-spec §10.1): the primary sections as
 * tabs (24 px icon over a label, a 3 px bar on the current one), then "More",
 * which opens a sheet with the rest, the account, the public site, help and
 * sign out. It sits above the home indicator.
 */
export function TabBarView({ items, badges = {}, pathname, account, viewSiteHref, helpHref, signOutAction }: TabBarViewProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const moreButton = useRef<HTMLButtonElement>(null);
  const tabs = items.filter((item) => item.group === "primary");
  const more = items.filter((item) => item.group === "secondary");
  const moreHoldsCurrent = [...more.map((item) => item.href), account.href].some((href) => isCurrentAdminPath(href, pathname));

  // Close the sheet on any navigation, including the back button.
  const [shownFor, setShownFor] = useState(pathname);
  if (pathname !== shownFor) {
    setShownFor(pathname);
    setMoreOpen(false);
  }

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] shadow-2 lg:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((item) => {
            const count = badges[item.section] ?? 0;
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={isCurrentAdminPath(item.href, pathname) ? "page" : undefined} className={tabClasses}>
                  <span className="relative">
                    <NavIcon icon={item.section} className="size-6" />
                    {count > 0 && (
                      <span aria-hidden="true" className={cx(badgeClasses, "absolute -top-1.5 left-[calc(100%-6px)]")}>
                        {badgeText(count)}
                      </span>
                    )}
                  </span>
                  <span>
                    {item.label}
                    {count > 0 && <BadgeDescription count={count} label={item.badgeLabel} />}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={moreButton}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              data-active={moreHoldsCurrent || undefined}
              onClick={() => setMoreOpen(true)}
              className={tabClasses}
            >
              <Ellipsis aria-hidden="true" strokeWidth={1.75} className="size-6" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet id={moreId} open={moreOpen} onClose={() => setMoreOpen(false)} title="More" placement="bottom" returnFocus={moreButton}>
        <ul className="-mx-4 border-t border-hairline">
          {more.map((item) => (
            <li key={item.href} className="border-b border-hairline">
              <Link
                href={item.href}
                aria-current={isCurrentAdminPath(item.href, pathname) ? "page" : undefined}
                className={cx(sheetRowClasses, "aria-[current=page]:text-primary")}
              >
                <NavIcon icon={item.section} className="size-5 shrink-0 text-fg-2" />
                {item.label}
              </Link>
            </li>
          ))}
          <li className="border-b border-hairline">
            <Link href={account.href} aria-current={isCurrentAdminPath(account.href, pathname) ? "page" : undefined} className={sheetRowClasses}>
              <NavIcon icon="account" className="size-5 shrink-0 text-fg-2" />
              <span className="min-w-0">
                <span className="block">Account</span>
                <span className="block truncate text-sm font-normal text-fg-3">
                  {account.name}, {account.roleLabel}
                </span>
              </span>
            </Link>
          </li>
          <li className="border-b border-hairline">
            <a href={viewSiteHref} target="_blank" rel="noopener noreferrer" className={sheetRowClasses}>
              <ArrowUpRight aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-fg-2" />
              View website <VisuallyHidden>{newTabHint}</VisuallyHidden>
            </a>
          </li>
          {helpHref && (
            <li className="border-b border-hairline">
              <a href={helpHref} target="_blank" rel="noopener noreferrer" className={sheetRowClasses}>
                <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-fg-2" />
                Get help from Weberu <VisuallyHidden>{whatsappHint}</VisuallyHidden>
              </a>
            </li>
          )}
          <li>
            <form action={signOutAction}>
              <button type="submit" className={sheetRowClasses}>
                <LogOut aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0 text-fg-2" />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </Sheet>
    </>
  );
}

/** The phone tab bar, marking the current page. */
export function TabBar(props: Omit<TabBarViewProps, "pathname">) {
  return <TabBarView {...props} pathname={usePathname()} />;
}
