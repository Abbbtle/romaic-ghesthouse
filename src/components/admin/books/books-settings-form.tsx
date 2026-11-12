"use client";

import { Select, type FieldOption } from "@/components/ui/fields";
import { formatMonth } from "@/lib/format/date-time";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { settingsSchema } from "@/lib/ledger/ledger-input";
import { ActionForm } from "../action-form";

const monthOptions: FieldOption[] = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1);
  return { value: month, label: formatMonth(`2000-${month.padStart(2, "0")}`).split(" ")[0]! };
});

function problems(data: FormData): FieldErrors {
  const parsed = parseWith(settingsSchema, Object.fromEntries(data));
  return parsed.ok ? {} : parsed.errors;
}

/**
 * The books' two settings, saved together from a save bar: the month the
 * financial year ends (February until the accountant confirms it), and the
 * bank account card-machine and EFT payments land in.
 */
export function BooksSettingsForm({
  action,
  yearEndMonth,
  mainBank,
  bankOptions,
}: {
  action: FormAction;
  yearEndMonth: number;
  mainBank: string;
  bankOptions: readonly FieldOption[];
}) {
  return (
    <ActionForm action={action} validate={problems} subject="the books' settings">
      <div className="grid gap-5 sm:max-w-md">
        <Select
          name="yearEndMonth"
          label="The financial year ends in"
          options={monthOptions}
          defaultValue={String(yearEndMonth)}
          hint="Set to February until your accountant confirms it. The year starts on the 1st of the month after."
        />
        <Select name="mainBank" label="Main bank account" options={bankOptions} defaultValue={mainBank} hint="Where card-machine and EFT payments land in the books." />
      </div>
    </ActionForm>
  );
}
