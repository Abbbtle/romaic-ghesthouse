"use client";

import { Copy } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A feed link to paste into a channel, with a Copy button. The link is the
 * secret that lets the channel read the calendar, so it's shown only to
 * those who may share it (channels:configure).
 */
export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const inputId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-bold text-ink">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <input
          id={inputId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-white px-3 font-mono text-sm text-ink sm:flex-1"
        />
        <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copy}>
          Copy
        </Button>
      </div>
      <p role="status" className={copied === "copied" ? "text-sm font-medium text-success-800" : copied === "failed" ? "text-sm text-fg-2" : "sr-only"}>
        {copied === "copied" ? "Copied. Paste it into the channel's calendar settings." : copied === "failed" ? "Couldn't copy it here: select the link and copy it instead." : ""}
      </p>
    </div>
  );
}
