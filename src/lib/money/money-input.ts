import { z } from "zod";
import { optionalText, randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import { manualPaymentMethods, paymentKinds } from "./money";

/**
 * What the money forms send, and how it's read. The service reads every
 * field again, whatever the browser checked.
 */

export const moneyLimits = {
  referenceMax: 80,
  reasonMax: 200,
  lineDescriptionMax: 120,
  /** Extra lines an invoice may carry beyond the stay itself. */
  maxExtraLines: 5,
  /** R1,000,000: more than any payment here, so a slip of extra zeros is caught. */
  maxCents: 100_000_000,
} as const;

const amount = (noun: string) =>
  randAmount({
    required: `Enter ${noun} in rand.`,
    invalid: `Enter ${noun} in rand, like 1250 or 1250.50.`,
    max: { cents: moneyLimits.maxCents, message: `Check ${noun}: it's more than R1,000,000.` },
  }).refine((cents) => cents > 0, `Enter ${noun} of more than R0.`);

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

export const recordPaymentSchema = z.object({
  kind: z.enum(paymentKinds, "Choose what the payment is for."),
  method: z.enum(manualPaymentMethods, "Choose how it was paid."),
  amount: amount("the amount"),
  receivedOn: isoDay("Choose the day it was received."),
  reference: optionalText({ max: moneyLimits.referenceMax, tooLong: `Keep the reference under ${moneyLimits.referenceMax} characters.` }),
  /** A random key the form carries, so a double-tap doesn't record the payment twice. */
  idempotencyKey: optionalText({ max: 64, tooLong: "Reload the page and try again." }),
});

export type RecordPaymentDraft = z.output<typeof recordPaymentSchema>;

export const voidSchema = z.object({
  reason: requiredText({ max: moneyLimits.reasonMax, required: "Say why it's being voided.", tooLong: `Keep the reason under ${moneyLimits.reasonMax} characters.` }),
});

const extraLineSchema = z.object({
  description: optionalText({ max: moneyLimits.lineDescriptionMax, tooLong: `Keep each description under ${moneyLimits.lineDescriptionMax} characters.` }),
  amount: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), amount("the line's amount").optional()),
});

/** Issuing an invoice: the stay is always its first line; up to five extra lines (laundry, an extra night agreed later…). */
export const issueInvoiceSchema = z
  .object({ extras: z.array(extraLineSchema).max(moneyLimits.maxExtraLines, `An invoice can carry at most ${moneyLimits.maxExtraLines} extra lines.`).default([]) })
  .superRefine((value, context) => {
    value.extras.forEach((line, index) => {
      if (line.description && line.amount === undefined) context.addIssue({ code: "custom", path: ["extras", index, "amount"], message: "Enter the line's amount in rand." });
      if (!line.description && line.amount !== undefined) context.addIssue({ code: "custom", path: ["extras", index, "description"], message: "Describe what the line is for." });
    });
  })
  .transform((value) => ({
    extras: value.extras.filter((line): line is { description: string; amount: number } => Boolean(line.description) && line.amount !== undefined),
  }));

export const testCheckoutSchema = z.object({ amount: amount("the amount") });

/** Reads the invoice form's "extras.0.description"-style fields into lines. */
export function extrasFromForm(fields: Record<string, unknown>): { extras: { description: unknown; amount: unknown }[] } {
  const extras: { description: unknown; amount: unknown }[] = [];
  for (let index = 0; index < moneyLimits.maxExtraLines; index += 1) {
    const description = fields[`extras.${index}.description`];
    const lineAmount = fields[`extras.${index}.amount`];
    if (description === undefined && lineAmount === undefined) continue;
    extras.push({ description, amount: lineAmount });
  }
  return { extras };
}
