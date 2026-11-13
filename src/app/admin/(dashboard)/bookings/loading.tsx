import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the bookings load. */
export default function BookingsLoading() {
  return <ListSkeleton rows={5} label="Loading bookings…" />;
}
