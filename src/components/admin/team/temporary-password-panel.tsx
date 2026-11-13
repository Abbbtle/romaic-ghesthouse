"use client";

import { Copy, KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { temporaryPasswordMessage, whatsappShareLink } from "./temporary-password";

type TemporaryPasswordPanelProps = {
  name: string;
  password: string;
  /** Why there's a new password: someone was added, or theirs was reset. */
  reason: "added" | "reset";
  /** The dashboard's sign-in page, for the message. */
  signInUrl: string;
  /** Done: the password goes for good. */
  onDismiss: () => void;
};

/**
 * A temporary password, shown this once (product-spec §9): copy it or send
 * it on WhatsApp, privately. Nothing keeps it: once this is dismissed or the
 * page is left, only a new reset makes another. Focus comes here when it
 * appears, so it's read out at once and Copy is the next stop.
 */
export function TemporaryPasswordPanel({ name, password, reason, signInUrl, onDismiss }: TemporaryPasswordPanelProps) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The dialog it came from hands focus back to its button as it closes, a moment later; then it comes here.
  useEffect(() => {
    const timer = window.setTimeout(() => heading.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [password]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <section aria-labelledby="temporary-password-title" className="rounded-md border border-success-100 bg-success-50 p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <KeyRound aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-success-800" />
        <div className="min-w-0 flex-1">
          <h2 id="temporary-password-title" ref={heading} tabIndex={-1} className="text-base font-bold text-ink focus:outline-none">
            {reason === "added" ? `${name} can sign in now` : `${name}'s password is reset`}
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            {reason === "added" ? "Their temporary password" : "Their new temporary password"} shows only now. Share it privately: they&apos;ll choose their
            own as soon as they sign in.
          </p>
          <p className="mt-3 rounded-sm border border-hairline bg-white px-3 py-2.5 font-mono text-lg tracking-wide break-all text-ink select-all">{password}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copy}>
              Copy password
            </Button>
            <WhatsAppButton href={whatsappShareLink(temporaryPasswordMessage({ name, password, signInUrl }))}>Send on WhatsApp</WhatsAppButton>
            <Button variant="ghost" onClick={onDismiss}>
              Done
            </Button>
          </div>
          <p role="status" className={copied === "copied" ? "mt-3 text-sm font-medium text-success-800" : copied === "failed" ? "mt-3 text-sm text-fg-2" : "sr-only"}>
            {copied === "copied" ? "Copied. Paste it into a private message." : copied === "failed" ? "Couldn't copy it here: select the password and copy it instead." : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
