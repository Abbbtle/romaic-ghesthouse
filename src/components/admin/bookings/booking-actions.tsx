"use client";

import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { useToast } from "../toast";

type Action = (id: string) => Promise<ConfirmedActionResult>;

/**
 * What can happen to a booking next, by its state and the person's
 * permissions: check in (from the arrival day), check out, mark a no-show
 * (gives the nights back), cancel (gives them back too). Each asks first.
 */
export function BookingActions({
  id,
  guestName,
  can,
  actions,
}: {
  id: string;
  guestName: string;
  can: { checkIn: boolean; checkOut: boolean; noShow: boolean; cancel: boolean };
  actions: { checkIn: Action; checkOut: Action; noShow: Action; cancel: (id: string, reason: string) => Promise<ConfirmedActionResult> };
}) {
  const toasts = useToast();
  const done = (message: string) => () => toasts?.show({ message });
  if (!Object.values(can).some(Boolean)) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {can.checkIn && (
        <ConfirmButton
          variant="primary"
          tone="primary"
          title={`Check in ${guestName}?`}
          confirmLabel="Check in"
          pendingLabel="Checking in…"
          action={() => actions.checkIn(id)}
          onDone={done(`${guestName} checked in`)}
        >
          Check in
        </ConfirmButton>
      )}
      {can.checkOut && (
        <ConfirmButton
          variant="primary"
          tone="primary"
          title={`Check out ${guestName}?`}
          description="Their room is marked for cleaning."
          confirmLabel="Check out"
          pendingLabel="Checking out…"
          action={() => actions.checkOut(id)}
          onDone={done(`${guestName} checked out`)}
        >
          Check out
        </ConfirmButton>
      )}
      {can.noShow && (
        <ConfirmButton
          variant="secondary"
          title={`Mark ${guestName} as a no-show?`}
          description="Their nights open again for others. Anything already paid stays recorded."
          confirmLabel="Mark no-show"
          pendingLabel="Saving…"
          action={() => actions.noShow(id)}
          onDone={done("Marked as a no-show")}
        >
          No-show
        </ConfirmButton>
      )}
      {can.cancel && (
        <ConfirmButton
          variant="ghost-danger"
          title={`Cancel ${guestName}'s booking?`}
          description="Its nights open again for others. Nothing is sent to the guest: let them know on WhatsApp or by email. Anything already paid stays recorded for a refund."
          confirmLabel="Cancel booking"
          pendingLabel="Cancelling…"
          action={() => actions.cancel(id, "")}
          onDone={done("Booking cancelled")}
        >
          Cancel booking
        </ConfirmButton>
      )}
    </div>
  );
}
