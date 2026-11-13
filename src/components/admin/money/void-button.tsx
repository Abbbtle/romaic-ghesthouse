"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/fields";
import { failedState } from "@/lib/forms/form-state";
import { moneyLimits } from "@/lib/money/money-input";
import type { ConfirmedActionResult } from "../confirm-button";
import { ConfirmDialog } from "../confirm-dialog";
import { callServerAction } from "../server-call";

const connectionFailure = "That didn't go through. Check your connection and try again.";

/** Why a result means it didn't work, or null when it did. */
function failureOf(result: ConfirmedActionResult): string | null {
  if (!result) return null;
  switch (result.status) {
    case "failed":
      return result.message;
    case "invalid":
      return Object.values(result.errors)[0] ?? "That didn't work. Reload the page and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again in another tab, then try again.";
    case "step-up":
      return "For your security, reload the page and confirm your password and code, then try again.";
    default:
      return null;
  }
}

/**
 * Voids a payment or an invoice, asking why first. Nothing is deleted: the
 * record stays, crossed out, with the reason, so the books still add up.
 */
export function VoidButton({
  subject,
  description,
  action,
  onDone,
}: {
  /** "the R600 deposit", "invoice INV-000004". */
  subject: string;
  description: string;
  action: (reason: string) => Promise<ConfirmedActionResult>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  const confirm = () => {
    if (!reason.trim()) {
      setError("Say why it's being voided.");
      return;
    }
    startTransition(async () => {
      const failure = failureOf(await callServerAction(() => action(reason.trim()), () => failedState(connectionFailure)));
      if (failure) {
        setError(failure);
        return;
      }
      setOpen(false);
      setReason("");
      onDone();
    });
  };

  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        variant="ghost-danger"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Void
      </Button>
      <ConfirmDialog
        open={open}
        title={`Void ${subject}?`}
        confirmLabel="Void it"
        pendingLabel="Voiding…"
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        returnFocus={trigger}
      >
        <p>{description}</p>
        {open && (
          <TextArea name="reason" label="Why" rows={2} maxLength={moneyLimits.reasonMax} placeholder="e.g. Entered twice" className="mt-4" onValueChange={setReason} />
        )}
      </ConfirmDialog>
    </>
  );
}
