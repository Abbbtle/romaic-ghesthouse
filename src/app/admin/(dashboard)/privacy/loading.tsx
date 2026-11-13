import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the privacy pages load. */
export default function PrivacyLoading() {
  return <ListSkeleton rows={4} label="Loading privacy…" />;
}
