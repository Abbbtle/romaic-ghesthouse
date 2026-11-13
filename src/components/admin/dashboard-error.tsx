"use client";

import { Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { textStyles } from "@/components/ui/typography";

/**
 * What the dashboard shows when a page fails: dashboard wording (never the
 * guest site's booking details), a way to try again, and the error's
 * reference to send to Weberu. The reference is Next.js's digest, which
 * names the failure in the server logs without carrying its details.
 */
export function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const details = [`Reference: ${error.digest ?? "none"}`, `Page: ${typeof location === "undefined" ? "" : location.pathname}`, `Time: ${new Date().toISOString()}`].join("\n");
  const copyDetails = () => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) return setCopy("failed");
    clipboard.writeText(details).then(
      () => setCopy("copied"),
      () => setCopy("failed"),
    );
  };
  return (
    <div role="alert" className="grid max-w-form gap-4 rounded-md border border-hairline bg-white p-6">
      <h1 className={textStyles.h3}>This page didn&apos;t load</h1>
      <p className="text-base text-fg-2">
        Nothing you saved earlier is lost. Try again; if it keeps happening, copy the error details and send them to Weberu.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" icon={<RotateCcw aria-hidden="true" />} onClick={retry}>
          Try again
        </Button>
        <Button type="button" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copyDetails}>
          Copy error details
        </Button>
      </div>
      <p role="status" className="text-sm text-fg-2 empty:hidden">
        {copy === "copied" ? "Copied. Paste them into a message to Weberu." : copy === "failed" ? `Couldn't copy them. The reference is ${error.digest ?? "not available"}.` : ""}
      </p>
    </div>
  );
}
