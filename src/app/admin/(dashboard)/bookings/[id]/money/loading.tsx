import { PageSkeleton } from "@/components/admin/skeletons";

/** Shown at once while the booking's money loads. */
export default function BookingMoneyLoading() {
  return <PageSkeleton label="Loading payments and invoices…" />;
}
