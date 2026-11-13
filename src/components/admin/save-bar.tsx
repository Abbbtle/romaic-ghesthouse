"use client";

import { useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { cx } from "@/components/ui/cx";

const holdWhileSaving = (event: MouseEvent) => event.preventDefault();

type SaveBarProps = {
  /** Whether the form has unsaved changes; the bar only shows while it does. */
  visible: boolean;
  /** Saving: Save says `pendingLabel` and Discard waits. */
  pending: boolean;
  saveLabel?: string;
  pendingLabel?: string;
};

/**
 * The bar that appears once a form has unsaved changes (design-spec §11.2):
 * a warning dot and "Unsaved changes", then Discard and Save. It sticks to
 * the bottom of the screen above the phone tab bar, and settles at the end of
 * the form once that's in view. Put it last inside the <form>: Save submits
 * the form; Discard asks first, then resets it to what was last saved.
 */
export function SaveBar({
  visible,
  pending,
  saveLabel = "Save changes",
  pendingLabel = "Saving…",
}: SaveBarProps) {
  const [confirming, setConfirming] = useState(false);
  const discard = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div
        // Lets the toasts rise above the bar while it shows (see ToastProvider).
        data-save-bar={visible || undefined}
        className={cx(
          "sticky bottom-(--admin-bottom-inset) z-10 -mx-4 mt-8 items-center justify-between gap-3 border-t border-hairline bg-white px-4 py-3 shadow-2 lg:bottom-6 lg:mx-0 lg:rounded-md lg:border",
          "transition-[opacity,translate,display] transition-discrete",
          visible
            ? "flex duration-200 ease-out starting:opacity-0 motion-safe:starting:translate-y-2"
            : "hidden opacity-0 duration-150 ease-in motion-safe:translate-y-2",
        )}
      >
        <p className="flex min-w-0 items-center gap-2 text-sm leading-tight font-medium text-fg">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-warning-600"
          />
          Unsaved changes
        </p>
        <div className="flex shrink-0 gap-3">
          <Button
            ref={discard}
            type="button"
            variant="secondary"
            aria-haspopup="dialog"
            aria-disabled={pending || undefined}
            onClick={pending ? holdWhileSaving : () => setConfirming(true)}
          >
            Discard
          </Button>
          <Button type="submit" pending={pending} pendingLabel={pendingLabel}>
            {saveLabel}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Discard your unsaved changes?"
        confirmLabel="Discard changes"
        onConfirm={() => {
          setConfirming(false);
          // Puts every field back to what was last saved, as the form's reset does.
          discard.current?.form?.reset();
        }}
        onCancel={() => setConfirming(false)}
        returnFocus={discard}
      >
        Everything you&apos;ve changed since you last saved goes back to how it
        was.
      </ConfirmDialog>
    </>
  );
}
