import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while a Books page loads: each one checks the session and reads the ledger first. */
export default function BooksLoading() {
  return <PageSkeleton label="Loading the books…" />;
}
