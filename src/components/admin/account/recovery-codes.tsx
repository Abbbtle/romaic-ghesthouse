"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "../confirm-dialog";
import { callServerAction } from "../server-call";
import { RecoveryCodeList } from "./recovery-code-list";

type MakeResult =
  | { status: "made"; recoveryCodes: string[] }
  | { status: "failed"; message: string }
  | { status: "signed-out" }
  | { status: "step-up" };

/**
 * Making new recovery codes: asked first, since the old ones stop working
 * straight away, and the new ones show once, with a copy button, until the
 * person says they've saved them. Needs the password and code again, like
 * other changes to how someone signs in.
 */
export function RecoveryCodes({ left, make, confirmHref }: { left: number; make: () => Promise<MakeResult>; confirmHref: string }) {
  const [asking, setAsking] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  const run = () =>
    startTransition(async () => {
      setFailure(null);
      const result = await callServerAction(make, () => ({ status: "failed" as const, message: "That didn't go through. Check your connection and try again." }));
      if (result.status === "made") {
        setAsking(false);
        setCodes(result.recoveryCodes);
      } else if (result.status === "step-up") {
        setAsking(false);
        setNeedsConfirm(true);
      } else if (result.status === "signed-out") {
        setFailure("You've been signed out. Sign in again in another tab, then try again.");
      } else {
        setFailure(result.message);
      }
    });

  if (codes) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-fg">New recovery codes. Your old ones no longer work. Save these somewhere safe, away from your phone: you won&apos;t see them again.</p>
        <RecoveryCodeList codes={codes}>
          <Button type="button" onClick={() => setCodes(null)}>
            I&apos;ve saved them
          </Button>
        </RecoveryCodeList>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-fg-2">
        {left === 0 ? "You have no recovery codes left." : `You have ${left} recovery code${left === 1 ? "" : "s"} left.`} Each lets you sign in once if you lose your phone.
      </p>
      {needsConfirm && (
        <p role="alert" className="text-sm text-danger-fg">
          Confirm your password and code first, then make new codes.{" "}
          <a href={confirmHref} className="font-medium underline underline-offset-4">
            Confirm now
          </a>
        </p>
      )}
      <div>
        <Button ref={trigger} type="button" variant="secondary" aria-haspopup="dialog" onClick={() => setAsking(true)}>
          Make new recovery codes
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        title="Replace your recovery codes?"
        confirmLabel="Make new codes"
        pendingLabel="Making codes…"
        pending={pending}
        error={failure}
        onConfirm={run}
        onCancel={() => {
          setAsking(false);
          setFailure(null);
        }}
        returnFocus={trigger}
      >
        {left === 0 ? "You'll see the new codes once." : `Your ${left} saved code${left === 1 ? "" : "s"} stop working straight away. You'll see the new ones once.`}
      </ConfirmDialog>
    </div>
  );
}
