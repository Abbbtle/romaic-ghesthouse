"use client";

import { TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { officerSchema, privacyLimits } from "@/lib/privacy/privacy-input";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { SheetForm } from "../sheet-form";

const validate = formValidator(officerSchema);

export type EditableOfficer = { name: string; email: string; phone: string; registrationReference: string };

/** The Information Officer's details in a sheet: who answers for personal information, and how people reach them. */
export function OfficerSheet({ officer, action, primary }: { officer: EditableOfficer | null; action: FormAction; primary: boolean }) {
  return (
    <SheetForm
      trigger={officer ? "Change" : "Add the Information Officer"}
      variant={primary ? "primary" : "secondary"}
      size="sm"
      title="Information Officer"
      description="The person who answers for guests' personal information and deals with their requests."
    >
      {(close) => (
        <ActionForm action={action} validate={validate} footer="button" submitLabel="Save details" pendingLabel="Saving…" onSaved={close}>
          <div className="grid gap-4">
            <TextField name="name" label="Name" autoComplete="off" maxLength={privacyLimits.nameMax} defaultValue={officer?.name ?? ""} />
            <TextField name="email" label="Email" type="email" autoComplete="off" maxLength={254} defaultValue={officer?.email ?? ""} hint="Where people write about their personal information." />
            <TextField name="phone" label="Phone" optional inputMode="tel" autoComplete="off" defaultValue={officer?.phone ?? ""} />
            <TextField
              name="registrationReference"
              label="Regulator registration reference"
              optional
              autoComplete="off"
              maxLength={privacyLimits.registrationMax}
              defaultValue={officer?.registrationReference ?? ""}
              hint="The reference the Information Regulator's eServices portal gave when you registered them."
            />
          </div>
        </ActionForm>
      )}
    </SheetForm>
  );
}
