"use client";

import { Button } from "@/components/ui/button";
import { anonymisedGuestName } from "@/lib/privacy/privacy";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { useQuickAction, type QuickResult } from "../tasks/use-quick-action";
import { useToast } from "../toast";

type AnonymiseAction = (guestId: string, confirmName: string, requestId: string | null) => Promise<ConfirmedActionResult>;

/**
 * Anonymises one guest on request, after a confirmation that names them and
 * says what goes and what stays. Permanent. The server refuses it while a
 * stay is booked or under way, or if the guest's name changed since. The
 * trigger is a quiet danger link; the filled danger button is only the
 * dialog's confirm.
 */
export function AnonymiseGuestButton({ guestId, name, requestId, action }: { guestId: string; name: string; requestId: string | null; action: AnonymiseAction }) {
  const toasts = useToast();
  return (
    <ConfirmButton
      variant="ghost-danger"
      size="sm"
      tone="danger"
      title={`Anonymise ${name}?`}
      description={
        <>
          Their name becomes &ldquo;{anonymisedGuestName}&rdquo;, and their phone number, email and notes, and the notes on their bookings, are removed for good. Their
          bookings, payments and invoices stay, and invoices already issued keep the name they were billed to. This can&apos;t be undone.
        </>
      }
      confirmLabel={`Anonymise ${name}`}
      pendingLabel="Anonymising…"
      action={() => action(guestId, name, requestId)}
      onDone={() => toasts?.show({ message: "Guest record anonymised" })}
    >
      Anonymise this guest
    </ConfirmButton>
  );
}

type LinkAction = (requestId: string, guestId: string) => Promise<QuickResult>;

/** Links a guest found by the search to the request they're about. */
export function LinkGuestButton({ requestId, guestId, primary, action }: { requestId: string; guestId: string; primary: boolean; action: LinkAction }) {
  const linking = useQuickAction();
  return (
    <span className="grid justify-items-start gap-1">
      <Button size="sm" variant={primary ? "primary" : "secondary"} pending={linking.pending} pendingLabel="Linking…" onClick={() => linking.run(() => action(requestId, guestId), "Guest linked to the request")}>
        Link to the request
      </Button>
      {linking.problem && (
        <span role="alert" className="text-sm font-medium text-danger-700">
          {linking.problem}
        </span>
      )}
    </span>
  );
}

/** Unlinks the guest from a request, when the wrong one was linked. */
export function UnlinkGuestButton({ requestId, action }: { requestId: string; action: (requestId: string) => Promise<QuickResult> }) {
  const unlinking = useQuickAction();
  return (
    <span className="grid justify-items-start gap-1">
      <Button size="sm" variant="ghost" pending={unlinking.pending} pendingLabel="Unlinking…" onClick={() => unlinking.run(() => action(requestId), "Guest unlinked")}>
        Not this guest
      </Button>
      {unlinking.problem && (
        <span role="alert" className="text-sm font-medium text-danger-700">
          {unlinking.problem}
        </span>
      )}
    </span>
  );
}
