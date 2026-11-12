import { randAmount } from "@/lib/forms/fields";
import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { addDays, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import { formErrorKey, type FieldErrors } from "@/lib/kernel/result";
import { journalLimits } from "@/lib/ledger/journals";
import { linesFromForm, manualJournalSchema } from "@/lib/ledger/ledger-input";

/**
 * The manual journal form's rules, as the browser checks them (the ledger
 * service checks every one again): the date and what it's for, each line
 * with an account and an amount on one side, at least two lines, and debits
 * equal to credits. Rows are named line.<n>.account, .debit, .credit and
 * .memo by their place in the form.
 */

export const lineFields = ["account", "debit", "credit", "memo"] as const;

/** The service's words for a month that's locked. */
export const lockedMonthMessage = "That month is locked. Reopen it first, or date the journal in an open month.";

const amount = randAmount({ required: "Enter an amount.", invalid: "Enter an amount in rand.", max: { cents: journalLimits.maxLineCents, message: "Too large." } });

/** What a typed amount comes to in cents, or null while it isn't one ("", "12.345", "abc"). */
export function typedCents(text: string): number | null {
  if (!text.trim()) return null;
  const parsed = amount.safeParse(text);
  return parsed.success ? parsed.data : null;
}

export type JournalTotals = { debitCents: number; creditCents: number; differenceCents: number; balanced: boolean };

/** The running totals as typed (amounts that can't be read yet count as nothing). It balances once both sides match and aren't nothing. */
export function journalTotals(rows: readonly { debit: string; credit: string }[]): JournalTotals {
  let debitCents = 0;
  let creditCents = 0;
  for (const row of rows) {
    debitCents += typedCents(row.debit) ?? 0;
    creditCents += typedCents(row.credit) ?? 0;
  }
  return { debitCents, creditCents, differenceCents: debitCents - creditCents, balanced: debitCents === creditCents && debitCents > 0 };
}

export type JournalFormContext = {
  today: IsoDate;
  /** Locked months, "2026-10". */
  lockedPeriods: readonly string[];
};

/** Every problem with the form as it stands, keyed by field ("line.2.debit"), or by "form" for the journal as a whole. */
export function journalFormProblems(fields: Record<string, unknown>, context: JournalFormContext): FieldErrors {
  const head = parseWith(manualJournalSchema, fields);
  const lines = linesFromForm(fields);
  const errors: FieldErrors = { ...(head.ok ? {} : head.errors), ...(lines.ok ? {} : lines.errors) };
  const date = fields.date;
  if (!errors.date && isIsoDate(date)) {
    if (date > addDays(context.today, 31)) errors.date = "Date it no more than a month ahead.";
    else if (context.lockedPeriods.includes(date.slice(0, 7))) errors.date = lockedMonthMessage;
  }
  if (lines.ok) {
    const debitCents = lines.lines.reduce((sum, line) => sum + line.debitCents, 0);
    const creditCents = lines.lines.reduce((sum, line) => sum + line.creditCents, 0);
    if (lines.lines.length < 2) errors[formErrorKey] = "A journal needs at least two lines.";
    else if (debitCents !== creditCents) errors[formErrorKey] = `Debits (${formatCents(debitCents)}) and credits (${formatCents(creditCents)}) must be equal.`;
  }
  return errors;
}

const isBlank = (value: unknown) => typeof value !== "string" || value.trim() === "";

/**
 * The form's fields with its empty rows left out and the rest numbered from
 * 0, as the service numbers lines, and for each line the form row it came
 * from (so the service's problems can go back to the right row).
 */
export function compactJournalFields(fields: Record<string, unknown>): { fields: Record<string, unknown>; rowOf: number[] } {
  const compacted: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([key]) => !key.startsWith("line.")));
  const rowOf: number[] = [];
  for (let row = 0; row < journalLimits.maxLines; row += 1) {
    const values = lineFields.map((field) => fields[`line.${row}.${field}`]);
    if (values.every(isBlank)) continue;
    const index = rowOf.length;
    rowOf.push(row);
    lineFields.forEach((field, position) => {
      if (values[position] !== undefined) compacted[`line.${index}.${field}`] = values[position];
    });
  }
  return { fields: compacted, rowOf };
}

/** The service's problems with the compacted lines, back on the form rows they came from ("Line 1:" becoming "Line 3:" too). */
export function errorsOnRows(errors: FieldErrors, rowOf: readonly number[]): FieldErrors {
  const placed: FieldErrors = {};
  for (const [key, message] of Object.entries(errors)) {
    const match = /^line\.(\d+)\.(\w+)$/.exec(key);
    const row = match ? rowOf[Number(match[1])] : undefined;
    if (!match || row === undefined) {
      placed[key] = message;
      continue;
    }
    placed[`line.${row}.${match[2]}`] = message.replace(new RegExp(`^Line ${Number(match[1]) + 1}:`), `Line ${row + 1}:`);
  }
  return placed;
}
