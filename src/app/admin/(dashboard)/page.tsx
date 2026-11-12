import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homeFor } from "@/components/admin/admin-routes";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { anySignedInRole, can } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";

export const metadata: Metadata = { title: "Today" };

/**
 * The dashboard's home. For the owner, sales and staff it's Today: arrivals,
 * departures, who's in and the rooms to clean, which arrive with bookings in
 * Phase 3. Admins don't run the house, so they land on their own first
 * section instead.
 */
export default async function TodayPage({ searchParams }: PageProps<"/admin">) {
  const actor = await requireDashboardActor(anySignedInRole);
  const { notice } = await searchParams;
  if (!can(actor, "today:view")) {
    const home = homeFor(actor.role);
    redirect(notice === "not-allowed" ? `${home}?notice=not-allowed` : home);
  }
  return (
    <>
      <PageHeader title="Today" description="Arrivals, departures and who's staying." />
      {notice === "not-allowed" && (
        <p role="status" className="mb-4 rounded-sm border border-hairline bg-surface-2 p-3 text-sm text-fg">
          That part of the dashboard isn&apos;t open to your role. Ask the owner if you need it.
        </p>
      )}
      <EmptyState title="Bookings come next">
        Once bookings are set up, this page will show who&apos;s arriving and leaving today, who&apos;s staying, and which apartments need cleaning.
      </EmptyState>
    </>
  );
}
