"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { failedState, type FormState } from "@/lib/forms/form-state";
import { ConfirmDialog, type ConfirmTone } from "./confirm-dialog";
import { callServerAction } from "./server-call";

/**
 * What a confirmed action answers: a form state (failed and invalid ones are
 * shown in the dialog), a dashboard action's { status: "signed-out" }, or
 * nothing when it redirects or refreshes the page itself.
 */
export type ConfirmedActionResult = FormState | { status: "signed-out" } | { status: "step-up" } | void;

const signedOutMessage = "You've been signed out. Sign in again in another tab, then try again.";
const stepUpMessage = "For your security, reload the page and confirm your password and code, then try again.";
const fallbackFailure = "That didn't work. Reload the page and try again.";
const connectionFailure = "That didn't go through. Check your connection and try again.";

/** Why a result means it didn't work, or null when it did. */
function failureOf(result: ConfirmedActionResult): string | null {
  if (!result) return null;
  switch (result.status) {
    case "failed":
      return result.message;
    case "invalid":
      return Object.values(result.errors)[0] ?? fallbackFailure;
    case "signed-out":
      return signedOutMessage;
    case "step-up":
      return stepUpMessage;
    default:
      return null;
  }
}

type ConfirmButtonProps = {
  /** The button that asks first: "Delete", "Remove from team". */
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  /** The question: "Remove Thabo from the team?" */
  title: string;
  /** What follows from it: "They'll lose access immediately." */
  description?: ReactNode;
  /** The confirming button: "Remove person". */
  confirmLabel: string;
  /** The confirming button while it works: "Removing…". */
  pendingLabel?: string;
  tone?: ConfirmTone;
  /** Runs once confirmed, typically a dashboard server action with its record bound. */
  action: () => Promise<ConfirmedActionResult>;
  /** After it worked and the dialog closed, e.g. to show a toast. */
  onDone?: (result: ConfirmedActionResult) => void;
};

/**
 * A button for a destructive action that asks first, in a ConfirmDialog
 * (design-spec §11.5). Nothing happens until the named confirm button is
 * pressed; if the action fails, the dialog stays open and says why.
 */
export function ConfirmButton({
  children,
  variant = "ghost-danger",
  size,
  icon,
  className,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone,
  action,
  onDone,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  const cancel = () => {
    setOpen(false);
    setFailure(null);
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await callServerAction(action, () => failedState(connectionFailure));
      const problem = failureOf(result);
      if (problem) {
        setFailure(problem);
        return;
      }
      setOpen(false);
      setFailure(null);
      onDone?.(result);
    });

  return (
    <>
      <Button ref={trigger} variant={variant} size={size} icon={icon} className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
        tone={tone}
        pending={pending}
        error={failure}
        onConfirm={confirm}
        onCancel={cancel}
        returnFocus={trigger}
      >
        {description}
      </ConfirmDialog>
    </>
  );
}
