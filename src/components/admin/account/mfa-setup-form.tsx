"use client";

import { useActionState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { RecoveryCodeList } from "./recovery-code-list";

type MfaSetupState = { status: "idle" } | { status: "invalid"; message: string } | { status: "confirmed"; recoveryCodes: string[] };

/**
 * Confirms a new authenticator with its first code, then shows the recovery
 * codes once, to write down or save, before going on. `alreadySetUp` is true
 * when the page renders again after the code was accepted (or on a later
 * visit): the codes, once shown, stay until the person goes on.
 */
export function MfaSetupForm({
  action,
  continueHref,
  alreadySetUp = false,
}: {
  action: (previous: MfaSetupState, formData: FormData) => Promise<MfaSetupState>;
  continueHref: string;
  alreadySetUp?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, { status: "idle" });

  if (state.status === "confirmed") {
    return (
      <section aria-labelledby="recovery-title" className="space-y-3">
        <h2 id="recovery-title" className="text-base font-semibold text-fg">
          Your authenticator is set up. Save these recovery codes.
        </h2>
        <p className="text-sm text-fg-2">
          If you lose your phone, each code lets you sign in once instead of an app code. Keep them somewhere safe, away from your phone. You won&apos;t see them again, but you can make new ones from your account page.
        </p>
        <RecoveryCodeList codes={state.recoveryCodes}>
          <a href={continueHref} className={buttonClasses({ variant: "primary" })}>
            Go to the dashboard
          </a>
        </RecoveryCodeList>
      </section>
    );
  }

  if (alreadySetUp) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg">It&apos;s set up. New phone? Ask an owner to reset your authenticator, then set it up again.</p>
        <a href={continueHref} className={buttonClasses({ variant: "primary" })}>
          Go to the dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-3" noValidate>
      <CodeInput name="code" label="Code from the app" error={state.status === "invalid" ? state.message : null} />
      <Button type="submit" fullWidth pending={pending} pendingLabel="Checking…">
        Confirm
      </Button>
    </form>
  );
}
