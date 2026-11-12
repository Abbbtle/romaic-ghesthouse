"use client";

import { DashboardError } from "@/components/admin/dashboard-error";

/**
 * A failure outside the dashboard's shell (the sign-in steps, or the shell
 * itself): the same dashboard message on the canvas, never the guest site's
 * error page.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center bg-chalk px-4 py-10 text-fg">
      <DashboardError error={error} retry={retry} />
    </main>
  );
}
