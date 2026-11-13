import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the activity log loads. */
export default function AuditLoading() {
  return <ListSkeleton rows={5} label="Loading activity…" />;
}
