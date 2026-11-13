import { ListSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the channels load. */
export default function ChannelsLoading() {
  return <ListSkeleton rows={4} label="Loading channels…" />;
}
