"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { TextArea } from "@/components/ui/fields";
import { failedState } from "@/lib/forms/form-state";
import type { ConfirmedActionResult } from "../confirm-button";
import { ConfirmDialog, type ConfirmTone } from "../confirm-dialog";
import { callServerAction } from "../server-call";
import { useToast } from "../toast";

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
 * A button that asks why before it acts (reversing a journal, reopening a
 * month): the question, what follows, and a reason that's kept on record.
 * Nothing happens until the named button is pressed with a reason given; a
 * refusal shows in the dialog. Once done, the server's message shows in a
 * toast.
 */
export function ReasonButton({
  children,
  variant = "secondary",
  tone = "primary",
  title,
  description,
  confirmLabel,
  pendingLabel,
  reasonLabel = "Why",
  placeholder,
  reasonRequired,
  maxLength = 200,
  action,
}: {
  /** The button: "Reverse", "Reopen". */
  children: ReactNode;
  variant?: ButtonVariant;
  tone?: ConfirmTone;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  reasonLabel?: string;
  placeholder?: string;
  /** What to say when no reason is given: "Say why it's being reversed." */
  reasonRequired: string;
  maxLength?: number;
  action: (reason: string) => Promise<ConfirmedActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const toasts = useToast();

  const confirm = () => {
    if (!reason.trim()) {
      setError(reasonRequired);
      return;
    }
    startTransition(async () => {
      const result = await callServerAction(() => action(reason.trim()), () => failedState(connectionFailure));
      const failure = failureOf(result);
      if (failure) {
        setError(failure);
        return;
      }
      setOpen(false);
      setReason("");
      if (result && result.status === "saved") toasts?.show({ message: result.message });
    });
  };

  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        variant={variant}
        aria-haspopup="dialog"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
        tone={tone}
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        returnFocus={trigger}
      >
        <p>{description}</p>
        {open && <TextArea name="reason" label={reasonLabel} rows={2} maxLength={maxLength} placeholder={placeholder} className="mt-4" onValueChange={setReason} />}
      </ConfirmDialog>
    </>
  );
}
