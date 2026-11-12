"use client";

import { useState } from "react";
import { DateField, SegmentedControl, Select, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { vatCategories } from "@/lib/tax/parameters";
import { legalFormNames, legalForms, type RegistrationKind } from "@/lib/tax/registrations";
import { registrationSchema } from "@/lib/tax/tax-input";
import { ActionForm } from "../action-form";
import { SheetForm } from "../sheet-form";

const problems = (data: FormData): FieldErrors => {
  const parsed = parseWith(registrationSchema, Object.fromEntries(data));
  return parsed.ok ? {} : parsed.errors;
};

/**
 * Records one registration in a sheet: whether the business is registered
 * and from when (or when it ended), the reference number (kept encrypted;
 * only its last digits show afterwards), and the VAT filing category or the
 * income tax legal form where those apply.
 */
export function RegistrationSheet({
  kind,
  name,
  help,
  current,
  action,
  primary,
}: {
  kind: RegistrationKind;
  name: string;
  help: string;
  current: { registered: boolean; effectiveFrom: string | null; vatCategory: string | null; legalForm: string | null } | null;
  action: FormAction;
  primary: boolean;
}) {
  const [registered, setRegistered] = useState(current?.registered === false ? "no" : "yes");
  return (
    <SheetForm trigger={current ? "Change" : "Record"} variant={primary ? "primary" : "secondary"} size="sm" title={name} description={help}>
      {(close) => (
        <ActionForm action={action} validate={problems} footer="button" submitLabel="Save registration" pendingLabel="Saving…" onSaved={close}>
          <input type="hidden" name="kind" value={kind} />
          <div className="grid gap-4">
            <SegmentedControl
              name="registered"
              label="Is the business registered?"
              options={[
                { value: "yes", label: "Registered" },
                { value: "no", label: "Not registered" },
              ]}
              defaultValue={registered}
              onValueChange={setRegistered}
            />
            <DateField
              name="effectiveFrom"
              label={registered === "yes" ? "Registered from" : "Not registered from"}
              defaultValue={current?.effectiveFrom ?? ""}
              hint={registered === "yes" ? "The date on the registration letter or eFiling." : "The date the registration ended, or today if it never existed."}
            />
            {registered === "yes" && (
              <>
                <TextField
                  name="reference"
                  label="Reference number"
                  optional
                  autoComplete="off"
                  maxLength={30}
                  hint="Kept encrypted. Afterwards only its last four digits are shown. Leave it empty to keep none."
                />
                {kind === "vat" && (
                  <Select
                    name="vatCategory"
                    label="Filing category"
                    placeholder="Choose the category"
                    options={vatCategories.map((category) => ({ value: category, label: `Category ${category}` }))}
                    defaultValue={current?.vatCategory ?? ""}
                    hint="On the VAT registration notice (VAT103). It decides when VAT201s are due."
                  />
                )}
                {kind === "income-tax" && (
                  <Select
                    name="legalForm"
                    label="How the business is set up"
                    placeholder="Choose one"
                    options={legalForms.map((form) => ({ value: form, label: legalFormNames[form] }))}
                    defaultValue={current?.legalForm ?? ""}
                    hint="Decides which tax table the provisional tax estimate uses. Ask your accountant if you're not sure."
                  />
                )}
              </>
            )}
          </div>
        </ActionForm>
      )}
    </SheetForm>
  );
}
