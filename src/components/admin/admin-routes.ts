import { can, type Permission } from "@/lib/accounts/access";
import type { Role } from "@/lib/kernel/actor";

/** The dashboard's pages. */
export const adminRoutes = {
  today: "/admin",
  requests: "/admin/requests",
  apartments: "/admin/apartments",
  content: "/admin/content",
  team: "/admin/team",
  audit: "/admin/audit",
  account: "/admin/account",
  signIn: "/admin/sign-in",
} as const;

/** The dashboard's sections, in navigation order. Later phases add bookings, guests, tasks, books and tax. */
export const adminSections = ["today", "requests", "content", "apartments", "team", "audit"] as const;

export type AdminSection = (typeof adminSections)[number];

/** Counts shown on sections' navigation: { today: 2 } puts a 2 on Today. */
export type AdminBadges = Partial<Record<AdminSection, number>>;

export type AdminNavItem = {
  section: AdminSection;
  href: string;
  label: string;
  /**
   * primary: a tab in the phone tab bar and the sidebar's first group.
   * secondary: under "More" on phones and the sidebar's second group.
   */
  group: "primary" | "secondary";
  /** Read after a badge's count, so the tab is named "Today, 2 waiting". */
  badgeLabel?: string;
  /** The permission a role needs to see the section (and that its pages check again). */
  permission: Permission;
};

/**
 * Every section and the permission it needs: the one list the navigation,
 * the home page's routing and the role tests read. Hiding a link is a
 * courtesy, not protection: every page and action checks the permission
 * again.
 */
export const adminNavigation: readonly AdminNavItem[] = [
  { section: "today", href: adminRoutes.today, label: "Today", group: "primary", permission: "today:view" },
  { section: "requests", href: adminRoutes.requests, label: "Requests", group: "primary", permission: "bookings:view", badgeLabel: "waiting" },
  { section: "content", href: adminRoutes.content, label: "Website", group: "primary", permission: "content:edit" },
  { section: "apartments", href: adminRoutes.apartments, label: "Apartments", group: "secondary", permission: "availability:view" },
  { section: "team", href: adminRoutes.team, label: "Team", group: "secondary", permission: "team:view" },
  { section: "audit", href: adminRoutes.audit, label: "Activity", group: "secondary", permission: "audit:view" },
];

/** The sections a person with this role sees. */
export function adminNavFor(role: Role): AdminNavItem[] {
  return adminNavigation.filter((item) => can({ role }, item.permission));
}

/**
 * Where a role lands on the dashboard's home: Today for those who run the
 * house, otherwise their first section (the website, for admins), or their
 * account page when they have none.
 */
export function homeFor(role: Role): string {
  return adminNavFor(role)[0]?.href ?? adminRoutes.account;
}

/** Whether a dashboard link is the current page or a page inside its section. Today matches only itself. */
export function isCurrentAdminPath(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === adminRoutes.today) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** What a badge shows: the count, or "99+" past that. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}
