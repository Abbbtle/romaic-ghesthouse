"use client";

import { formValidator } from "@/components/admin/form-validator";
import { PasswordField } from "@/components/admin/password-field";
import { SubmitForm } from "@/components/admin/submit-form";
import { TextField } from "@/components/ui/fields";
import { accountLimits, passwordLimits, setupInput, setupTokenLimit } from "@/lib/accounts/input";
import type { FormAction } from "@/lib/forms/form-state";

const validate = formValidator(setupInput);

/** The first owner's name, address and password, and the setup code when the server asks for one. */
export function SetupForm({ action, needsToken }: { action: FormAction; needsToken: boolean }) {
  return (
    <SubmitForm action={action} validate={validate} submitLabel="Create account" pendingLabel="Creating account…" fullWidth>
      <TextField name="name" label="Your name" autoComplete="name" maxLength={accountLimits.name} />
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="username" maxLength={accountLimits.email} />
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        maxLength={passwordLimits.max}
        hint={`At least ${passwordLimits.min} characters. A short sentence is easy to remember and hard to guess.`}
      />
      <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" maxLength={passwordLimits.max} />
      {needsToken && (
        <PasswordField
          name="setupToken"
          label="Setup code"
          autoComplete="off"
          maxLength={setupTokenLimit}
          hint="The ADMIN_SETUP_TOKEN set on the server. It proves you run this site."
        />
      )}
    </SubmitForm>
  );
}
