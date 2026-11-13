"use client";

import { Plus } from "lucide-react";
import { TextArea, TextField } from "@/components/ui/fields";
import { supplierSchema } from "@/lib/bookkeeping/bookkeeping-input";
import { expenseLimits } from "@/lib/bookkeeping/expenses";
import type { FormAction } from "@/lib/forms/form-state";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { SheetForm } from "../sheet-form";

const validate = formValidator(supplierSchema);

/** Adds a supplier, or changes one's name and notes, in a slide-over. */
export function SupplierSheet({ action, supplier }: { action: FormAction; supplier?: { id: string; name: string; notes: string | null } }) {
  return (
    <SheetForm
      trigger={supplier ? "Change" : "Add supplier"}
      icon={supplier ? undefined : <Plus aria-hidden="true" />}
      variant={supplier ? "secondary" : "primary"}
      size="sm"
      title={supplier ? `Change ${supplier.name}` : "Add a supplier"}
      description={supplier ? "Its expenses keep their place; only the name and notes change." : "Someone you pay: a shop, a business or a person. Suppliers are also added as you record expenses."}
    >
      {(close) => (
        <ActionForm action={action} validate={validate} footer="button" submitLabel={supplier ? "Save supplier" : "Add supplier"} subject="this supplier" resetOnSave={!supplier} onSaved={close} className="grid gap-4">
          {supplier && <input type="hidden" name="supplierId" value={supplier.id} />}
          <TextField name="name" label="Name" maxLength={expenseLimits.supplierNameMax} defaultValue={supplier?.name} />
          <TextArea name="notes" label="Notes" optional rows={3} maxLength={expenseLimits.supplierNotesMax} defaultValue={supplier?.notes ?? undefined} hint="Their account number with you, who to call, when they deliver." />
        </ActionForm>
      )}
    </SheetForm>
  );
}
