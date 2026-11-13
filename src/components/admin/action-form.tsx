"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ValidatedForm } from "@/components/ui/form";
import { preferredScrollBehavior } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { failedState, idleFormState, type FormAction, type FormState } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";
import { ConfirmDialog } from "./confirm-dialog";
import { SaveBar } from "./save-bar";
import { callServerAction } from "./server-call";
import { useToast, type ToastAction } from "./toast";

const connectionFailure = "Couldn't save your changes. Check your connection and try again.";

/**
 * save-bar: an edit saved as a whole, such as a content section or settings.
 * A bar with Discard and Save appears once something changes.
 * button: a form that does one thing, such as adding a person or changing a
 * password; its button is always there.
 */
export type ActionFormFooter = "save-bar" | "button";

type ActionFormProps = {
  /** The server action (dashboardFormAction(…)), or any function of that shape. */
  action: FormAction;
  /**
   * The server's rules, run in the browser as people leave each field and on
   * submit (the core's zod schema through parseWith). The server always
   * checks again. Functions can't be passed from server components, so a
   * small client component per form supplies this.
   */
  validate?: (data: FormData) => FieldErrors;
  footer?: ActionFormFooter;
  submitLabel?: string;
  pendingLabel?: string;
  /** What's being edited, for the leave dialog: "Your changes to Hero will be lost." */
  subject?: string;
  /** Something to do next, offered in the "saved" toast: { label: "View on site", href: "/#about" }. */
  savedAction?: ToastAction;
  /** Empties the form once it has saved, for forms that add things. */
  resetOnSave?: boolean;
  /** Called each time it saves, with the server's message, e.g. to close a sheet. */
  onSaved?: (message: string) => void;
  /** button footer only: things beside the button, such as a Cancel link. */
  footerExtras?: ReactNode;
  /** button footer only: "secondary" when another form on the page holds the one primary action. */
  submitVariant?: "primary" | "secondary";
  className?: string;
  children: ReactNode;
};

/**
 * A dashboard form posting to a server action (design-spec §11.1–11.2, house
 * ActionForm). Fields are checked as people leave them and the button always
 * works; problems from the server land beside their fields, and a failure
 * shows above the form with everything kept. A saved form says so in a toast.
 * While there are unsaved changes, leaving the page asks first.
 */
export function ActionForm({
  action,
  validate,
  footer = "save-bar",
  submitLabel = footer === "save-bar" ? "Save changes" : "Save",
  pendingLabel = "Saving…",
  subject,
  savedAction,
  resetOnSave = false,
  onSaved,
  footerExtras,
  submitVariant = "primary",
  className,
  children,
}: ActionFormProps) {
  // A save that never reached the server is a failure to show, not a crash.
  const send = useMemo<FormAction>(() => (previous, data) => callServerAction(() => action(previous, data), () => failedState(connectionFailure)), [action]);
  const [state, dispatch, pending] = useActionState(send, idleFormState);
  const [dirty, setDirty] = useState(false);
  const [leavingFor, setLeavingFor] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const toasts = useToast();
  const router = useRouter();

  // A save makes the form clean again; adopted while rendering, so the bar goes at once.
  const [adoptedState, setAdoptedState] = useState<FormState>(state);
  if (state !== adoptedState) {
    setAdoptedState(state);
    if (state.status === "saved") setDirty(false);
  }

  // Each answer is acted on once, even when the page is hidden and shown again.
  const handled = useRef<FormState>(state);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.status === "failed") banner.current?.scrollIntoView({ block: "nearest", behavior: preferredScrollBehavior() });
    if (state.status !== "saved") return;
    if (resetOnSave) form.current?.reset();
    toasts?.show({ message: state.message, action: savedAction });
    onSaved?.(state.message);
    // Save sat in the bar, which has gone: keep focus in the form rather than losing it.
    const focused = document.activeElement;
    if (!focused || focused === document.body || !focused.checkVisibility()) form.current?.focus({ preventScroll: true });
  }, [state, resetOnSave, toasts, savedAction, onSaved]);

  useUnsavedChangesGuard(dirty && !pending, setLeavingFor);

  // Leaving drops the changes: a page the router keeps for coming back to
  // would otherwise still show them, unsaved.
  const leave = () => {
    if (leavingFor === null) return;
    form.current?.reset();
    setLeavingFor(null);
    router.push(leavingFor);
  };

  const savedMessage = state.status === "saved" && !dirty && !toasts ? state.message : "";

  return (
    <>
      <ValidatedForm
        ref={form}
        // React owns the submission: before the page's scripts arrive, a
        // submit goes nowhere instead of falling back to a GET that would put
        // every field in the address (and the browser's history).
        action={dispatch}
        tabIndex={-1}
        validate={validate}
        serverErrors={state.status === "invalid" ? state.errors : undefined}
        onValidSubmit={(data) => startTransition(() => dispatch(data))}
        onEdit={() => setDirty(true)}
        onReset={() => setDirty(false)}
        aria-busy={pending || undefined}
        banner={
          state.status === "failed" && (
            <div ref={banner} className="scroll-mt-24">
              <Notice tone="danger">{state.message}</Notice>
            </div>
          )
        }
        className={cx("focus:outline-none", className)}
      >
        {children}
        {footer === "save-bar" ? (
          <SaveBar visible={dirty || pending} pending={pending} saveLabel={submitLabel} pendingLabel={pendingLabel} />
        ) : (
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button type="submit" variant={submitVariant} pending={pending} pendingLabel={pendingLabel}>
              {submitLabel}
            </Button>
            {footerExtras}
          </div>
        )}
        {/* Present from the start, so screen readers notice what arrives in it. Toasts say it inside the dashboard. */}
        <p role="status" className={savedMessage ? "mt-3 text-sm font-medium text-success-800" : "sr-only"}>
          {savedMessage}
        </p>
      </ValidatedForm>

      <ConfirmDialog
        open={leavingFor !== null}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        cancelLabel="Stay on page"
        onConfirm={leave}
        onCancel={() => setLeavingFor(null)}
      >
        {subject ? (
          <>
            Your changes to <strong className="font-bold text-fg">{subject}</strong> will be lost.
          </>
        ) : (
          "Your changes will be lost."
        )}
      </ConfirmDialog>
    </>
  );
}
