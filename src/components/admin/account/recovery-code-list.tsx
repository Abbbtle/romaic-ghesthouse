"use client";

import { Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Recovery codes, shown once: the list, a copy button that says whether
 * copying worked (announced to screen readers), and `children`, the step
 * that confirms they're saved.
 */
export function RecoveryCodeList({ codes, children }: { codes: readonly string[]; children: ReactNode }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyCodes = () => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      setCopy("failed");
      return;
    }
    clipboard.writeText(codes.join("\n")).then(
      () => setCopy("copied"),
      () => setCopy("failed"),
    );
  };
  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-sm border border-hairline p-3 font-mono text-sm text-fg" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copyCodes}>
          Copy codes
        </Button>
        {children}
      </div>
      <p role="status" className="text-sm text-fg-2 empty:hidden">
        {copy === "copied" ? "Copied. Paste them somewhere safe, away from your phone." : copy === "failed" ? "Couldn't copy them. Select the codes and copy them, or write them down." : ""}
      </p>
    </div>
  );
}
