import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the money reports load: they check the session and read bookings, payments and the books first. */
export default function RevenueReportsLoading() {
  return <PageSkeleton label="Loading the money reports…" />;
}
