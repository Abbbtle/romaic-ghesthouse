import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the bank accounts and their statements load. */
export default function BankLoading() {
  return <PageSkeleton label="Loading the bank…" />;
}
