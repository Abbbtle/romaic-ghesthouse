"use client";

import { formValidator } from "@/components/admin/form-validator";
import { SubmitForm } from "@/components/admin/submit-form";
import { CodeInput } from "@/components/ui/code-input";
import { mfaCodeInput } from "@/lib/accounts/input";
import type { FormAction } from "@/lib/forms/form-state";

const validate = formValidator(mfaCodeInput);

/**
 * One field for an authenticator code or a recovery code. The browser and
 * phone keyboards suggest one-time codes from texts and apps through
 * autocomplete="one-time-code".
 */
export function MfaCodeForm({ action, next, submitLabel }: { action: FormAction; next?: string; submitLabel: string }) {
  return (
    <SubmitForm action={action} validate={validate} submitLabel={submitLabel} pendingLabel="Checking…" fullWidth>
      {next && <input type="hidden" name="next" value={next} />}
      <CodeInput name="code" label="Code from your app, or a recovery code" kind="recovery" autoFocus />
    </SubmitForm>
  );
}
