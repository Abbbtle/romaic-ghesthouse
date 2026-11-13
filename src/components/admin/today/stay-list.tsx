"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import type { QuickResult } from "../tasks/use-quick-action";
import { useQuickAction } from "../tasks/use-quick-action";
import { useToast } from "../toast";
import type { StayRow } from "./today-labels";

/** Arriving: check in or mark a no-show. Leaving: check out. Staying: nothing to do. */
export type StayListKind = "arriving" | "leaving" | "staying";

export type StayActions = {
  checkIn: (id: string) => Promise<QuickResult>;
  checkOut: (id: string) => Promise<ConfirmedActionResult>;
  noShow: (id: string) => Promise<ConfirmedActionResult>;
};

function StayItem({ stay, kind, actions }: { stay: StayRow; kind: StayListKind; actions: StayActions | null }) {
  const checkingIn = useQuickAction();
  const toasts = useToast();
  return (
    <li className="px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">
            {stay.href ? (
              <Link href={stay.href} className="underline-offset-4 hover:underline">
                {stay.guestName}
              </Link>
            ) : (
              stay.guestName
            )}
          </p>
          <p className="mt-0.5 text-sm text-fg-2">{[stay.place, stay.when, stay.guests].filter(Boolean).join(" · ")}</p>
          {stay.serviceNotes && (
            <p className="mt-1.5 max-w-[60ch] text-sm whitespace-pre-line text-fg">
              <span className="font-medium">Notes: </span>
              {stay.serviceNotes}
            </p>
          )}
        </div>
        {actions && kind === "arriving" && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button size="sm" pending={checkingIn.pending} pendingLabel="Checking in…" onClick={() => checkingIn.run(() => actions.checkIn(stay.id), `${stay.guestName} checked in`)}>
              Check in
            </Button>
            <ConfirmButton
              size="sm"
              variant="ghost"
              title={`Mark ${stay.guestName} as a no-show?`}
              description="Their nights open again for others. Anything already paid stays recorded."
              confirmLabel="Mark no-show"
              pendingLabel="Saving…"
              action={() => actions.noShow(stay.id)}
              onDone={() => toasts?.show({ message: "Marked as a no-show" })}
            >
              No-show
            </ConfirmButton>
          </div>
        )}
        {actions && kind === "leaving" && (
          <ConfirmButton
            size="sm"
            variant="primary"
            tone="primary"
            title={`Check out ${stay.guestName}?`}
            description={`${stay.unitName} is marked for cleaning and its clean is added to the list.`}
            confirmLabel="Check out"
            pendingLabel="Checking out…"
            action={() => actions.checkOut(stay.id)}
            onDone={() => toasts?.show({ message: `${stay.guestName} checked out` })}
          >
            Check out
          </ConfirmButton>
        )}
      </div>
      {checkingIn.problem && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
          {checkingIn.problem}
        </p>
      )}
    </li>
  );
}

/** The stays in one part of Today, each with what can be done about it now by someone who may check guests in and out. */
export function StayList({ label, stays, kind, actions }: { label: string; stays: readonly StayRow[]; kind: StayListKind; actions: StayActions | null }) {
  return (
    <ul aria-label={label} className="divide-y divide-hairline">
      {stays.map((stay) => (
        <StayItem key={stay.id} stay={stay} kind={kind} actions={actions} />
      ))}
    </ul>
  );
}
