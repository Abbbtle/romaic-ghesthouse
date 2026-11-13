"use client";

import { RotateCcw } from "lucide-react";
import { failedState, type FormState } from "@/lib/forms/form-state";
import { ConfirmButton } from "../confirm-button";

/** The server action that puts an earlier version back: the section, the version, and the revision the person was looking at. */
export type RestoreRevision = (
  section: string,
  revision: number,
  expectedRevision: number,
) => Promise<FormState | { status: "signed-out" } | { status: "step-up" } | void>;

const stepUpMessage = "Confirm it's you first: enter your password and code again in another tab, then try again.";

type RestoreRevisionButtonProps = {
  section: string;
  sectionName: string;
  revision: number;
  /** The revision live now: a restore over a newer one is refused. */
  currentRevision: number;
  restore: RestoreRevision;
};

/**
 * Puts an earlier version back, after asking. The version is saved again as
 * a new revision, so the one it replaces stays in the history and can be put
 * back in turn.
 */
export function RestoreRevisionButton({ section, sectionName, revision, currentRevision, restore }: RestoreRevisionButtonProps) {
  return (
    <ConfirmButton
      variant="primary"
      icon={<RotateCcw aria-hidden="true" />}
      title={`Put version ${revision} of ${sectionName} back?`}
      description={`Your site will show this version straight away. The version live now (${currentRevision}) stays in the history, so you can put it back later.`}
      confirmLabel="Put this version back"
      pendingLabel="Putting it back…"
      tone="primary"
      action={async () => {
        const result = await restore(section, revision, currentRevision);
        return result && result.status === "step-up" ? failedState(stepUpMessage) : result;
      }}
    >
      Put this version back
    </ConfirmButton>
  );
}
