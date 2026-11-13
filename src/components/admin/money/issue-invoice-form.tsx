"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { extrasFromForm, issueInvoiceSchema, moneyLimits } from "@/lib/money/money-input";
import { ActionForm } from "../action-form";

/** The service's rules for the extra lines, as fields are left; it checks them again. */
function invoiceProblems(data: FormData): FieldErrors {
  const parsed = parseWith(issueInvoiceSchema, extrasFromForm(Object.fromEntries(data)));
  return parsed.ok ? {} : parsed.errors;
}

/**
 * Issues an invoice for the booking: the stay at its agreed total (shown as
 * it will read), plus up to five extra lines. It's numbered as it's issued
 * and billed to the guest as they are now. No VAT line while the business
 * is treated as not VAT-registered (open question #1, ../../../lib/money/money.ts).
 */
export function IssueInvoiceForm({ bookingId, action, stayLine }: { bookingId: string; action: FormAction; stayLine: { description: string; amount: string } }) {
  const [rows, setRows] = useState(0);
  return (
    <ActionForm
      action={action}
      validate={invoiceProblems}
      footer="button"
      submitLabel="Issue invoice"
      submitVariant="secondary"
      pendingLabel="Issuing…"
      subject="this invoice"
      resetOnSave
      onSaved={() => setRows(0)}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid gap-1 rounded-md border border-hairline bg-neutral-25 px-3 py-2.5">
        <p className="text-xs font-bold text-fg-3">First line</p>
        <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-ink">
          <span>{stayLine.description}</span>
          <span className="font-bold tabular-nums">{stayLine.amount}</span>
        </p>
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <fieldset key={index} className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <legend className="sr-only">Extra line {index + 1}</legend>
          <TextField name={`extras.${index}.description`} label={`Extra line ${index + 1}`} maxLength={moneyLimits.lineDescriptionMax} placeholder="e.g. Laundry" />
          <TextField name={`extras.${index}.amount`} label="Amount (R)" inputMode="decimal" autoComplete="off" maxLength={16} />
        </fieldset>
      ))}
      {rows < moneyLimits.maxExtraLines && (
        <div>
          <Button size="sm" variant="ghost" icon={<Plus aria-hidden="true" />} onClick={() => setRows((count) => count + 1)}>
            Add an extra line
          </Button>
        </div>
      )}
    </ActionForm>
  );
}
