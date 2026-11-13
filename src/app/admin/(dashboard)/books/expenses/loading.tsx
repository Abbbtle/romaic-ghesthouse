import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while expenses load. */
export default function ExpensesLoading() {
  return <PageSkeleton label="Loading expenses…" />;
}
