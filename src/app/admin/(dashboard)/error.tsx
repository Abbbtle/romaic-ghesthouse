"use client";

import { DashboardError } from "@/components/admin/dashboard-error";

/** A dashboard page that failed: shown inside the shell, so the navigation stays. */
export default function DashboardPageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <DashboardError error={error} retry={retry} />;
}
