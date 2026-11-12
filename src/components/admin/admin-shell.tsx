import { ArrowUpRight, LogOut, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LogoSlot } from "@/components/ui/logo-slot";
import { newTabHint, VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { roleNames, type Actor } from "@/lib/kernel/actor";
import { SidebarNav, SidebarNavView, TabBar, TabBarView, type SignOutAction } from "./admin-nav";
import { adminNavFor, adminRoutes, type AdminBadges } from "./admin-routes";
import { ToastProvider } from "./toast";

/** The public site's home page, opened from the dashboard in a new tab. */
const viewSiteHref = "/";

type AdminShellProps = {
  /** Who is signed in (the session's Actor). Owners also see Team. */
  user: Pick<Actor, "name" | "role">;
  /** Counts on sections, such as the requests waiting: { requests: 2 }. */
  badges?: AdminBadges;
  /** Signs out (the sign-out server action). */
  signOutAction: SignOutAction;
  /** A WhatsApp link to the agency, offered as "Get help from Weberu". */
  helpHref?: string;
  /** The current path, when the caller knows it (previews). Otherwise it is read from the router. */
  currentPath?: string;
  children: ReactNode;
};

const footerRowClasses =
  "flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:bg-chalk hover:text-fg";

/**
 * The dashboard's frame (design-spec §10.1, SPEC §7.6): chalk canvas; from
 * 1024 px a 248 px white sidebar (lockup, sections, then the public site, the
 * account and sign out); below that a tab bar with "More". Pages go in its
 * <main>, which leaves room for the tab bar and the phone's home indicator,
 * and start with a PageHeader. Toasts are available to everything inside
 * (useToast).
 */
export function AdminShell({ user, badges, signOutAction, helpHref, currentPath, children }: AdminShellProps) {
  const items = adminNavFor(user.role);
  const account = { name: user.name, roleLabel: roleNames[user.role], href: adminRoutes.account };
  const tabBar = { items, badges, account, viewSiteHref, helpHref, signOutAction };

  return (
    <ToastProvider>
      <div data-admin-shell className="min-h-svh bg-chalk lg:flex">
        <aside className="sticky top-0 hidden h-svh w-62 shrink-0 flex-col overflow-y-auto border-r border-hairline bg-white lg:flex">
          <Link href={adminRoutes.today} className="mx-3 mt-5 mb-6 flex flex-col items-start gap-2 rounded-sm px-3 py-1">
            <LogoSlot kind="corner-mark" decorative />
            <span className="text-sm text-fg-3">
              <VisuallyHidden>Romaic Guesthouse </VisuallyHidden>Dashboard
            </span>
          </Link>

          {currentPath === undefined ? (
            <Suspense fallback={<SidebarNavView items={items} badges={badges} pathname={null} />}>
              <SidebarNav items={items} badges={badges} />
            </Suspense>
          ) : (
            <SidebarNavView items={items} badges={badges} pathname={currentPath} />
          )}

          <div className="mt-auto grid gap-0.5 border-t border-hairline p-3">
            <a href={viewSiteHref} target="_blank" rel="noopener noreferrer" className={footerRowClasses}>
              <ArrowUpRight aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
              View website <VisuallyHidden>{newTabHint}</VisuallyHidden>
            </a>
            {helpHref && (
              <a href={helpHref} target="_blank" rel="noopener noreferrer" className={footerRowClasses}>
                <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
                Get help from Weberu <VisuallyHidden>{whatsappHint}</VisuallyHidden>
              </a>
            )}
            <Link href={account.href} className={footerRowClasses}>
              <UserRound aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
              <span className="grid min-w-0 text-left">
                <span>Account</span>
                <span className="truncate text-xs font-normal text-fg-3">
                  {account.name} · {account.roleLabel}
                </span>
              </span>
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={footerRowClasses}>
                <LogOut aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-[calc(var(--admin-bottom-inset)+2rem)] lg:px-8 lg:pt-8 lg:pb-12">
          {children}
        </main>
      </div>

      {currentPath === undefined ? (
        <Suspense fallback={<TabBarView {...tabBar} pathname={null} />}>
          <TabBar {...tabBar} />
        </Suspense>
      ) : (
        <TabBarView {...tabBar} pathname={currentPath} />
      )}
    </ToastProvider>
  );
}
