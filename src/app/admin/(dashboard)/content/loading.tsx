import { ContentOverviewSkeleton } from "@/components/admin/content/content-skeletons";

/** Shown at once while the content page loads, so a tap on Content answers straight away. */
export default function ContentLoading() {
  return <ContentOverviewSkeleton />;
}
