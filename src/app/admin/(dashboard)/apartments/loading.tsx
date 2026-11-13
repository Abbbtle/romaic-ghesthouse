import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the apartments load. */
export default function ApartmentsLoading() {
  return <ListSkeleton rows={4} label="Loading apartments…" />;
}
