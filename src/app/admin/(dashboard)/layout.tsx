import { AdminShell } from "@/components/admin/admin-shell";
import { anySignedInRole } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
import { reportError } from "@/server/infrastructure";
import { bookingService } from "@/server/stays";
import { signOut } from "../(auth)/actions";

/**
 * Coming into the dashboard (from sign-in, say) waits for the session check
 * here, which decides whether to show it at all. Moving between its pages
 * doesn't: the layout stays, and each page's loading.tsx shows at once.
 */
export const instant = false;

/**
 * The signed-in dashboard: the shell with the navigation for the person's
 * role. The session is checked here for the navigation, and again by every
 * page and action, since layouts don't render again on navigation.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/admin">) {
  const actor = await requireDashboardActor(anySignedInRole);
  // The waiting count is a courtesy: if it can't be read, the dashboard still opens.
  const waiting = await bookingService()
    .inbox.waitingCount(actor)
    .catch((error: unknown) => {
      reportError("The waiting requests couldn't be counted", error);
      return 0;
    });
  return (
    <AdminShell user={actor} badges={waiting > 0 ? { requests: waiting } : undefined} signOutAction={signOut}>
      {children}
    </AdminShell>
  );
}
