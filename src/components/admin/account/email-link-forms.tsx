"use client";

import { formValidator } from "@/components/admin/form-validator";
import { PasswordField } from "@/components/admin/password-field";
import { SubmitForm } from "@/components/admin/submit-form";
import { CodeInput } from "@/components/ui/code-input";
import { TextField } from "@/components/ui/fields";
import { accountLimits, forgotPasswordInput, passwordLimits, resetPasswordInput, stepUpInput } from "@/lib/accounts/input";
import type { FormAction } from "@/lib/forms/form-state";

const validateEmail = formValidator(forgotPasswordInput);
const validateStepUp = formValidator(stepUpInput);
const validateReset = formValidator(resetPasswordInput);
const newPasswordHint = `At least ${passwordLimits.min} characters. A short sentence is easy to remember and hard to guess.`;

/** Asking for a password reset link. */
export function EmailLinkForm({ action }: { action: FormAction }) {
  return (
    <SubmitForm action={action} validate={validateEmail} submitLabel="Email me a link" pendingLabel="Sending…" fullWidth>
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="username" maxLength={accountLimits.email} />
    </SubmitForm>
  );
}

/** Choosing a new password from a reset link; the token rides along hidden. */
export function ResetPasswordForm({ action, token, email }: { action: FormAction; token: string; email?: string }) {
  return (
    <SubmitForm action={action} validate={validateReset} submitLabel="Set new password" pendingLabel="Saving…" fullWidth>
      <input type="hidden" name="token" value={token} />
      {email && <input type="hidden" name="username" autoComplete="username" value={email} readOnly />}
      <PasswordField name="newPassword" label="New password" autoComplete="new-password" maxLength={passwordLimits.max} hint={newPasswordHint} />
      <PasswordField name="confirmPassword" label="New password again" autoComplete="new-password" maxLength={passwordLimits.max} />
    </SubmitForm>
  );
}

/** Confirming an email address from its link, by pressing a button. */
export function VerifyEmailForm({ action, token }: { action: FormAction; token: string }) {
  return (
    <SubmitForm action={action} submitLabel="Confirm my email address" pendingLabel="Confirming…" fullWidth>
      <input type="hidden" name="token" value={token} />
    </SubmitForm>
  );
}

/** Re-entering the password (and code) before a sensitive change. */
export function ConfirmIdentityForm({ action, next, needsCode }: { action: FormAction; next: string; needsCode: boolean }) {
  return (
    <SubmitForm action={action} validate={validateStepUp} submitLabel="Confirm" pendingLabel="Checking…" fullWidth>
      <input type="hidden" name="next" value={next} />
      <PasswordField name="password" label="Password" autoComplete="current-password" maxLength={passwordLimits.max} />
      {needsCode && <CodeInput name="code" kind="recovery" label="Code from your authenticator app, or a recovery code" />}
    </SubmitForm>
  );
}
