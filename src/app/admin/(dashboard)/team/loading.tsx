import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the team loads. */
export default function TeamLoading() {
  return <ListSkeleton rows={3} label="Loading your team…" />;
}
