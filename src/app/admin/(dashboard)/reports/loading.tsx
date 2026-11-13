import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while a Reports page loads: each one checks the session and reads the bookings first. */
export default function ReportsLoading() {
  return <PageSkeleton label="Loading the reports…" />;
}
