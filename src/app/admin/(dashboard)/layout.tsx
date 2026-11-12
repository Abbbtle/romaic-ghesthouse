import { AdminShell } from "@/components/admin/admin-shell";
import { anySignedInRole } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
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
  return (
    <AdminShell user={actor} signOutAction={signOut}>
      {children}
    </AdminShell>
  );
}
