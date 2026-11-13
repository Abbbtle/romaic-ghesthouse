"use client";

import { NumberField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { SheetForm } from "../sheet-form";
import { useToast } from "../toast";

/** Sets how long a kind of record is kept before the daily job acts on it. Saving it also confirms it. */
export function PeriodSheet({
  kind,
  name,
  unit,
  period,
  range,
  action,
}: {
  kind: string;
  name: string;
  unit: "years" | "months";
  period: number | null;
  range: { min: number; max: number };
  action: FormAction;
}) {
  const words = unit === "years" ? "years" : "months";
  return (
    <SheetForm trigger="Change" variant="secondary" size="sm" title={name} description={`How many ${words} before the daily job acts. Saving it confirms the rule, and it applies from the next run.`}>
      {(close) => (
        <ActionForm action={action} footer="button" submitLabel="Save and confirm" pendingLabel="Saving…" onSaved={close}>
          <input type="hidden" name="kind" value={kind} />
          <NumberField
            name="period"
            label={unit === "years" ? "Years" : "Months"}
            defaultValue={period ?? undefined}
            hint={`Between ${range.min} and ${range.max} ${words}.${kind === "guest-records" ? " At least SARS's record-keeping period." : ""}`}
          />
        </ActionForm>
      )}
    </SheetForm>
  );
}

/** Confirms a rule as it stands. For the two the daily job applies, that's what switches them on. */
export function ConfirmRuleButton({
  kind,
  name,
  rule,
  applies,
  primary,
  action,
}: {
  kind: string;
  name: string;
  /** The rule in words, repeated in the question. */
  rule: string;
  /** Whether confirming makes the daily job act on it (anonymising or deleting for good). */
  applies: boolean;
  primary: boolean;
  action: (kind: string) => Promise<ConfirmedActionResult>;
}) {
  const toasts = useToast();
  return (
    <ConfirmButton
      size="sm"
      variant={primary ? "primary" : "secondary"}
      tone={applies ? "danger" : "primary"}
      title={`Confirm the rule for ${name.toLowerCase()}?`}
      description={applies ? `${rule} From the next daily run, this happens by itself, and it can't be undone.` : rule}
      confirmLabel="Confirm rule"
      pendingLabel="Saving…"
      action={() => action(kind)}
      onDone={() => toasts?.show({ message: "Rule confirmed" })}
    >
      Confirm
    </ConfirmButton>
  );
}
