"use client";

import { ServerErrorMessage } from "@/components/site/status-views";

/** A public page that failed to render, inside the site's frame: a way to try again, and the booking details. */
export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main" className="flex flex-1 items-center">
      <ServerErrorMessage retry={retry} />
    </main>
  );
}
