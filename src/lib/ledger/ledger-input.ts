import { z } from "zod";
import { randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import type { FieldErrors } from "@/lib/kernel/result";
import { journalLimits, type JournalLine } from "./journals";

/** What the books' forms send, checked at the boundary (zod) before the service's own rules. */

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

export const manualJournalSchema = z.object({
  /** Made when the form is shown: the same key twice (a double tap, a resend) posts once. */
  idempotencyKey: z.uuid("Reload the page and try again.").optional(),
  date: isoDay("Choose the journal's date."),
  memo: requiredText({ max: journalLimits.memoMax, required: "Say what the journal is for.", tooLong: `Keep it under ${journalLimits.memoMax} characters.` }),
});

const lineAmount = randAmount({ required: "Enter an amount.", invalid: "Enter an amount in rand, like 1250 or 1250.50.", max: { cents: journalLimits.maxLineCents, message: "That amount is too large for one line." } });

/**
 * A manual journal's lines from its form: line.<n>.account, .debit, .credit
 * and .memo, numbered from 0. A row with nothing in it is skipped; a row
 * with an amount on both sides, or on neither, is an error on that row.
 */
export function linesFromForm(input: Record<string, unknown>): { ok: true; lines: JournalLine[] } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const lines: JournalLine[] = [];
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string).trim() : "");
  for (let index = 0; index < journalLimits.maxLines; index += 1) {
    const prefix = `line.${index}.`;
    const account = text(`${prefix}account`);
    const debit = text(`${prefix}debit`);
    const credit = text(`${prefix}credit`);
    const memo = text(`${prefix}memo`);
    if (!account && !debit && !credit && !memo) continue;
    if (!/^\d{4}$/.test(account)) {
      errors[`${prefix}account`] = "Choose an account.";
      continue;
    }
    if ((debit === "") === (credit === "")) {
      errors[`${prefix}debit`] = "Enter the amount as a debit or a credit, not both.";
      continue;
    }
    const parsed = lineAmount.safeParse(debit || credit);
    if (!parsed.success || parsed.data <= 0) {
      errors[debit ? `${prefix}debit` : `${prefix}credit`] = parsed.success ? "Enter an amount above zero." : (parsed.error.issues[0]?.message ?? "Enter an amount.");
      continue;
    }
    if (memo.length > journalLimits.lineMemoMax) {
      errors[`${prefix}memo`] = `Keep the line's note under ${journalLimits.lineMemoMax} characters.`;
      continue;
    }
    lines.push({ accountCode: account, debitCents: debit ? parsed.data : 0, creditCents: credit ? parsed.data : 0, party: null, memo: memo || null });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, lines };
}

export const reverseSchema = z.object({
  reason: requiredText({ max: 200, required: "Say why it's being reversed.", tooLong: "Keep the reason under 200 characters." }),
});

export const newAccountSchema = z.object({
  code: z.string("Enter a four-digit code.").trim().regex(/^[1-6]\d{3}$/, "Enter a four-digit code starting 1 to 6, like 5250."),
  name: requiredText({ max: 60, required: "Enter the account's name.", tooLong: "Keep the name under 60 characters." }),
});

export const unlockSchema = z.object({
  reason: requiredText({ max: 200, required: "Say why the month is being reopened.", tooLong: "Keep the reason under 200 characters." }),
});

export const settingsSchema = z.object({
  yearEndMonth: z.coerce.number<string>({ error: "Choose the month the financial year ends." }).int().min(1, "Choose a month.").max(12, "Choose a month."),
  mainBank: z.string("Choose the main bank account.").regex(/^10\d\d$/, "Choose a bank account."),
});
