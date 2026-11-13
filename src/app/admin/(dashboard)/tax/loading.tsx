import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the tax pages load. */
export default function TaxLoading() {
  return <ListSkeleton rows={4} label="Loading tax…" />;
}
