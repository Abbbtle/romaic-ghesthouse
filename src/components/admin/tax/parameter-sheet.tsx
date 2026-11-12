"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField, SegmentedControl, TextArea, TextField } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { parameterCatalogue, type ParameterCode } from "@/lib/tax/parameters";
import { parameterValueFrom, parameterVersionSchema, taxLimits } from "@/lib/tax/tax-input";
import { ActionForm } from "../action-form";

const problems = (data: FormData): FieldErrors => {
  const fields = Object.fromEntries(data);
  const parsed = parseWith(parameterVersionSchema, fields);
  const errors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
  const code = String(fields.code ?? "") as ParameterCode;
  if (!errors.value && fields.status === "verified" && typeof fields.value === "string" && fields.value.trim() && parameterCatalogue[code]) {
    const read = parameterValueFrom(code, fields.value);
    if (!read.ok) errors.value = read.message;
  }
  return errors;
};

const valueHints: Record<string, string> = {
  percent: "As a number, like 15 for 15%.",
  cents: "In rand, like 2300000.",
  years: "Whole years, like 5.",
  table: "As JSON: copy the current version's and change it. Amounts are in cents.",
  rule: "As JSON: copy the current version's and change it.",
};

/**
 * Adds a new version of a parameter, read on sars.gov.za: its value (or that
 * it couldn't be confirmed), the dates it applies, the page and the day it
 * was checked, and what the page says. The earlier versions stay.
 *
 * Every row of Rates and dates has one, so its trigger is a quiet ghost link
 * (with the parameter's name for screen readers) rather than a bordered
 * button: a change is rare, and two dozen buttons would drown the values.
 */
export function ParameterSheet({ code, name, unit, currentValue, today, action }: { code: ParameterCode; name: string; unit: string; currentValue: string; today: string; action: FormAction }) {
  const [status, setStatus] = useState("verified");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <Button ref={trigger} variant="ghost" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Add a version<VisuallyHidden>{` of ${name}`}</VisuallyHidden>
      </Button>
      <Sheet open={open} onClose={close} returnFocus={trigger} title={`New version: ${name}`} description="Read it on sars.gov.za today, then record what the page says. Earlier versions stay as they were.">
        <div className="pt-2">
          <ActionForm action={action} validate={problems} footer="button" submitLabel="Add version" pendingLabel="Adding…" onSaved={close}>
            <input type="hidden" name="code" value={code} />
            <div className="grid gap-4">
              <SegmentedControl
                name="status"
                label="Did the page state it plainly?"
                options={[
                  { value: "verified", label: "Yes, confirmed" },
                  { value: "unverified", label: "No, can't confirm" },
                ]}
                defaultValue={status}
                onValueChange={setStatus}
              />
              {status === "verified" ? (
                unit === "table" || unit === "rule" ? (
                  <TextArea name="value" label="Value" rows={6} defaultValue={currentValue} hint={valueHints[unit]} />
                ) : (
                  <TextField name="value" label="Value" inputMode="decimal" defaultValue={currentValue} hint={valueHints[unit]} />
                )
              ) : (
                <input type="hidden" name="value" value="" />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField name="effectiveFrom" label="Applies from" />
                <DateField name="effectiveTo" label="Applies until" optional hint="Only if the page gives an end date." />
              </div>
              <TextField
                name="sourceUrl"
                label="The sars.gov.za page"
                type="url"
                inputMode="url"
                placeholder="https://www.sars.gov.za/…"
                maxLength={taxLimits.urlMax}
                hint="Only pages on sars.gov.za can be used."
              />
              <TextField name="sourceTitle" label="The page's title" maxLength={taxLimits.titleMax} />
              <DateField name="checkedOn" label="Checked on" defaultValue={today} max={today} />
              <TextArea
                name="note"
                label={status === "verified" ? "What the page says" : "Why it can't be confirmed"}
                rows={3}
                maxLength={taxLimits.noteMax}
                hint={status === "verified" ? "Quote the sentence that states it." : "For example: the page didn't load, or it gives last year's figure only."}
              />
            </div>
          </ActionForm>
        </div>
      </Sheet>
    </>
  );
}
