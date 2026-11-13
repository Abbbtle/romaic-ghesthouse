"use client";

import type { ConfirmedActionResult } from "../confirm-button";
import { ReasonButton } from "./reason-button";

/**
 * Reverses a journal, asking why: its reversal has the same lines on the
 * opposite sides, dated today, and both stay on record.
 */
export function ReverseJournalButton({
  journalId,
  today,
  fromPayment,
  action,
}: {
  journalId: string;
  /** "Thursday 12 November 2026". */
  today: string;
  /** Posted by a payment: voiding the payment reverses it, which is usually what's wanted. */
  fromPayment: boolean;
  action: (id: string, reason: string) => Promise<ConfirmedActionResult>;
}) {
  return (
    <ReasonButton
      variant="secondary"
      tone="danger"
      title="Reverse this journal?"
      description={`${fromPayment ? "This came from a payment. If the payment itself was a mistake, void it on the booking's payments page instead: that reverses this journal by itself. " : ""}A new journal, dated today (${today}), puts the same amounts on the opposite sides, so together they come to nothing. Both stay on record. If the figures were wrong, post a corrected journal afterwards.`}
      confirmLabel="Reverse journal"
      pendingLabel="Reversing…"
      placeholder="e.g. Posted to the wrong account"
      reasonRequired="Say why it's being reversed."
      action={(reason) => action(journalId, reason)}
    >
      Reverse
    </ReasonButton>
  );
}
