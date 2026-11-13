import { PageSkeleton } from "@/components/admin/skeletons";

/**
 * Shown at once while a dashboard page loads, for pages without a skeleton
 * of their own. Without it a tap in the navigation would seem to do nothing
 * until the page arrived: every dashboard page checks the session and reads
 * the database first.
 */
export default function DashboardLoading() {
  return <PageSkeleton />;
}
