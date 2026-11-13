"use client";

import { formValidator } from "@/components/admin/form-validator";
import { PasswordField } from "@/components/admin/password-field";
import { SubmitForm } from "@/components/admin/submit-form";
import { TextField } from "@/components/ui/fields";
import { accountLimits, passwordLimits, signInInput } from "@/lib/accounts/input";
import type { FormAction } from "@/lib/forms/form-state";

const validate = formValidator(signInInput);

/** Email and password. `next` is where to go afterwards, checked again on the server. */
export function SignInForm({ action, next }: { action: FormAction; next: string }) {
  return (
    <SubmitForm action={action} validate={validate} submitLabel="Sign in" pendingLabel="Signing in…" fullWidth>
      <input type="hidden" name="next" value={next} />
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="username" maxLength={accountLimits.email} />
      <PasswordField name="password" label="Password" autoComplete="current-password" maxLength={passwordLimits.max} />
    </SubmitForm>
  );
}
