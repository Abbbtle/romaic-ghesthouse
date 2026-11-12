import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the requests load. */
export default function RequestsLoading() {
  return <ListSkeleton rows={3} label="Loading booking requests…" />;
}
