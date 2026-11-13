"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Notice } from "@/components/ui/notice";
import { textStyles } from "@/components/ui/typography";
import { useModalDialog } from "@/hooks/use-modal-dialog";

/** danger: the action can't be undone (deleting, removing, leaving without saving). primary: it can. */
export type ConfirmTone = "danger" | "primary";

type ConfirmDialogProps = {
  open: boolean;
  /** The question, naming what happens to what: "Delete Lebogang M's testimonial?" */
  title: string;
  /** What follows from it: "It will disappear from your website straight away." Room for a choice too, such as which sessions. */
  children?: ReactNode;
  /** The confirming button: a verb for the action, "Delete testimonial". */
  confirmLabel: string;
  /** The way back. It has the focus when the dialog opens. */
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Working: the confirm button shows a spinner and `pendingLabel`. */
  pending?: boolean;
  pendingLabel?: string;
  /** Why it didn't work, shown in the dialog so the person can try again or back out. */
  error?: string | null;
  onConfirm: () => void;
  /** The cancel button, Escape or a press on the backdrop. */
  onCancel: () => void;
  /** The control that opened it, which gets the focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
};

/**
 * A question before something that can't be undone (design-spec §11.5): a
 * centred 400 px modal (bottom of the screen on phones) with the question,
 * one sentence on what follows, and two buttons. Cancel has the focus, the
 * confirming button names the action, and Escape cancels. Never open a
 * second one from inside it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  pendingLabel = "Working…",
  error,
  onConfirm,
  onCancel,
  returnFocus,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);
  const { ref, backdropProps } = useModalDialog(open, onCancel, { initialFocus: cancelButton, returnFocus });

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      className={cx(
        "mx-auto mt-auto mb-[calc(1rem+env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-[400px] rounded-lg border border-hairline bg-white p-0 text-fg shadow-3 sm:my-auto",
        "opacity-0 transition-[opacity,overlay,display] transition-discrete duration-150 ease-in open:opacity-100 open:ease-out starting:open:opacity-0",
        "backdrop:bg-[rgb(13_15_12/0.55)] backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-150 open:backdrop:opacity-100 starting:open:backdrop:opacity-0",
      )}
      {...backdropProps}
    >
      <div className="p-5 sm:p-6">
        <h2 id={titleId} className={cx(textStyles.h4, "text-ink")}>
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-2 text-base text-fg-2">
            {children}
          </div>
        )}
        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
        <div className="mt-6 grid gap-3 sm:flex sm:justify-end">
          <Button ref={cancelButton} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} pending={pending} pendingLabel={pendingLabel} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
