import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the tasks load. */
export default function TasksLoading() {
  return <ListSkeleton rows={5} label="Loading tasks…" />;
}
