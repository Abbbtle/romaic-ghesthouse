"use client";

import { Plus } from "lucide-react";
import { TextField } from "@/components/ui/fields";
import { bankLimits } from "@/lib/bookkeeping/bank";
import { bankAccountSchema } from "@/lib/bookkeeping/bookkeeping-input";
import type { FormAction } from "@/lib/forms/form-state";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { SheetForm } from "../sheet-form";

const validate = formValidator(bankAccountSchema);

/** Adds a bank account in a slide-over: a name for it, the bank, and the number (kept encrypted; only its last four digits are shown). */
export function AddAccountSheet({ action, variant = "primary" }: { action: FormAction; variant?: "primary" | "secondary" }) {
  return (
    <SheetForm
      trigger="Add bank account"
      icon={<Plus aria-hidden="true" />}
      variant={variant}
      size="sm"
      title="Add a bank account"
      description="One the business uses. No bank is connected: you import its statements yourself."
    >
      {() => (
        <ActionForm action={action} validate={validate} footer="button" submitLabel="Add bank account" pendingLabel="Adding…" subject="this bank account" className="grid gap-4">
          <TextField name="name" label="Name for it" maxLength={bankLimits.nameMax} placeholder="e.g. Business cheque" hint="How it's shown here and in the books." />
          <TextField name="bankName" label="Bank" maxLength={bankLimits.bankNameMax} autoComplete="off" />
          <TextField
            name="accountNumber"
            label="Account number"
            inputMode="numeric"
            autoComplete="off"
            maxLength={30}
            hint="Kept encrypted. Only its last four digits are ever shown."
          />
        </ActionForm>
      )}
    </SheetForm>
  );
}
