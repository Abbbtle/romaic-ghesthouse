"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ValidatedForm } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { idleFormState, type FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

type SubmitFormProps = {
  /** The server action, as it is: a form posting to it works before the page's scripts have loaded. */
  action: FormAction;
  /**
   * The server's rules for the fields, run in the browser as people leave
   * each one and when they submit. Leave it out for a form with nothing to
   * check (a single button): a server page can't pass a function to this
   * client component.
   */
  validate?: (data: FormData) => FieldErrors;
  submitLabel: string;
  pendingLabel: string;
  /** Stretches the button across the form, as on the sign-in card. */
  fullWidth?: boolean;
  /** Empties the fields once the action has worked, such as a password that was just changed. */
  resetOnSave?: boolean;
  children: ReactNode;
};

/**
 * A form that does one thing with what's typed, such as signing in or
 * changing a password (design-spec §10.9, §11.1): fields checked as people
 * leave them, a button that always works, problems from the server beside
 * their fields, and a failure above them. Unlike ActionForm it posts to the
 * server action itself, so a password typed before the scripts arrive is
 * still sent the right way, never in the address.
 */
const nothingToCheck = (): FieldErrors => ({});

export function SubmitForm({ action, validate = nothingToCheck, submitLabel, pendingLabel, fullWidth = false, resetOnSave = false, children }: SubmitFormProps) {
  const [state, dispatch, pending] = useActionState(action, idleFormState);
  const [offline, setOffline] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSave && state.status === "saved") form.current?.reset();
  }, [state, resetOnSave]);

  return (
    <ValidatedForm
      ref={form}
      action={dispatch}
      validate={validate}
      serverErrors={state.status === "invalid" ? state.errors : undefined}
      onValidSubmit={(data) => {
        // The form posts to the server action itself (see above), so a lost connection can't be caught
        // around the call; a phone that knows it's offline is told so instead, keeping what was typed.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setOffline(true);
          return;
        }
        setOffline(false);
        startTransition(() => dispatch(data));
      }}
      aria-busy={pending || undefined}
      banner={
        offline ? (
          <Notice tone="danger">You&apos;re offline. Check your signal, then try again: what you typed is still here.</Notice>
        ) : (
          state.status === "failed" && <Notice tone="danger">{state.message}</Notice>
        )
      }
      className="grid gap-5"
    >
      {children}
      {state.status === "saved" && <Notice tone="success">{state.message}</Notice>}
      <div>
        <Button type="submit" fullWidth={fullWidth} pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </Button>
      </div>
    </ValidatedForm>
  );
}
