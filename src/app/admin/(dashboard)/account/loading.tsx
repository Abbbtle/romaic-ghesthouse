import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the account page loads. */
export default function AccountLoading() {
  return <PageSkeleton label="Loading your account…" />;
}
