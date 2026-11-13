"use client";

import { Lock } from "lucide-react";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { useToast } from "../toast";
import { ReasonButton } from "./reason-button";

/** Locks a month that has ended, asking first. */
export function LockMonthButton({ period, label, action }: { period: string; label: string; action: (period: string) => Promise<ConfirmedActionResult> }) {
  const toasts = useToast();
  return (
    <ConfirmButton
      size="sm"
      variant="secondary"
      tone="primary"
      icon={<Lock aria-hidden="true" />}
      title={`Lock ${label}?`}
      description={`Nothing more can be posted in ${label}: a payment or check-out for it recorded later is posted with that day's date instead. Lock a month once its returns are filed. It can be reopened, with a reason.`}
      confirmLabel={`Lock ${label}`}
      pendingLabel="Locking…"
      action={() => action(period)}
      onDone={() => toasts?.show({ message: `${label} locked` })}
    >
      Lock
      <span className="sr-only"> {label}</span>
    </ConfirmButton>
  );
}

/** Reopens a locked month, asking why. */
export function ReopenMonthButton({ period, label, action }: { period: string; label: string; action: (period: string, reason: string) => Promise<ConfirmedActionResult> }) {
  return (
    <ReasonButton
      variant="ghost"
      title={`Reopen ${label}?`}
      description={`Journals can be posted in ${label} again until it's locked once more. The reason is kept on record.`}
      confirmLabel={`Reopen ${label}`}
      pendingLabel="Reopening…"
      placeholder="e.g. The accountant found a missing invoice"
      reasonRequired="Say why the month is being reopened."
      action={(reason) => action(period, reason)}
    >
      Reopen
      <span className="sr-only"> {label}</span>
    </ReasonButton>
  );
}
