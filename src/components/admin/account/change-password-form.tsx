"use client";

import { changePasswordInput, passwordLimits, replaceTemporaryPasswordInput } from "@/lib/accounts/input";
import type { FormAction } from "@/lib/forms/form-state";
import { formValidator } from "../form-validator";
import { PasswordField } from "../password-field";
import { SubmitForm } from "../submit-form";

const validateChange = formValidator(changePasswordInput);
const validateReplacement = formValidator(replaceTemporaryPasswordInput);

const newPasswordHint = `At least ${passwordLimits.min} characters. A short sentence is easy to remember and hard to guess.`;

type ChangePasswordFormProps = {
  action: FormAction;
  /** The account's address, so password managers save the new password against it. */
  email: string;
  /** Choosing one's own after signing in with a temporary password, which isn't asked for again. */
  replacingTemporary: boolean;
};

/**
 * A new password, typed twice. Changing your own also asks for the current
 * one; replacing a temporary password doesn't (signing in with it proved
 * it). Used on the password page and the account page.
 */
export function ChangePasswordForm({ action, email, replacingTemporary }: ChangePasswordFormProps) {
  return (
    <SubmitForm
      action={action}
      validate={replacingTemporary ? validateReplacement : validateChange}
      submitLabel={replacingTemporary ? "Save my password" : "Change password"}
      pendingLabel="Saving…"
      fullWidth={replacingTemporary}
      resetOnSave
    >
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {!replacingTemporary && <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" maxLength={passwordLimits.max} />}
      <PasswordField name="newPassword" label="New password" autoComplete="new-password" maxLength={passwordLimits.max} hint={newPasswordHint} />
      <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" maxLength={passwordLimits.max} />
    </SubmitForm>
  );
}
