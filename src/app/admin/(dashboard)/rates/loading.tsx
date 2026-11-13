import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the rates load. */
export default function RatesLoading() {
  return <ListSkeleton rows={4} label="Loading rates…" />;
}
