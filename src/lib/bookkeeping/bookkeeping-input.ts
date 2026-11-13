import { z } from "zod";
import { optionalText, randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import { accountNumberDigits, bankLimits, lineKinds } from "./bank";
import { csvSeparators } from "./csv";
import { expenseLimits, paymentSources } from "./expenses";
import { dateFormats, decimalMarks, statementLimits, type StatementMapping } from "./statement";

/**
 * What the expenses and bank forms send, checked at the boundary (zod)
 * before the services' own rules. The same schemas run in the browser as
 * fields are left; the server always reads everything again.
 */

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const optionalId = z.preprocess(blankToUndefined, z.string().max(64, "Reload the page and try again.").optional());

const accountCode = (message: string) => z.string(message).trim().regex(/^[1-6]\d{3}$/, message);

export const expenseSchema = z
  .object({
    date: isoDay("Choose the day it was paid."),
    /** An existing supplier's id, or "new" (or nothing) with supplierName. */
    supplierId: optionalId,
    supplierName: optionalText({ max: expenseLimits.supplierNameMax, tooLong: `Keep the name under ${expenseLimits.supplierNameMax} characters.` }),
    accountCode: accountCode("Choose what it was for."),
    amount: randAmount({
      required: "Enter the amount in rand.",
      invalid: "Enter the amount in rand, like 1250 or 1250.50.",
      max: { cents: expenseLimits.maxCents, message: "Check the amount: it's more than R1,000,000." },
    }).refine((cents) => cents > 0, "Enter an amount of more than R0."),
    description: requiredText({ max: expenseLimits.descriptionMax, required: "Say what it was.", tooLong: `Keep it under ${expenseLimits.descriptionMax} characters.` }),
    paidBy: z.enum(paymentSources, "Choose how it was paid."),
    bankAccountId: optionalId,
    channelAccount: z.preprocess(blankToUndefined, accountCode("Choose the channel.").optional()),
    /** The statement line it's being recorded from, to match once it's posted. */
    bankLineId: optionalId,
  })
  .superRefine((value, context) => {
    // Nothing chosen in the list asks for a choice there; "Someone new" asks for their name.
    if (value.supplierId === undefined && !value.supplierName) context.addIssue({ code: "custom", path: ["supplierId"], message: "Choose who it was paid to." });
    if (value.supplierId === "new" && !value.supplierName) context.addIssue({ code: "custom", path: ["supplierName"], message: "Enter who it was paid to." });
    if (value.paidBy === "channel" && !value.channelAccount) context.addIssue({ code: "custom", path: ["channelAccount"], message: "Choose the channel." });
  });

export type ExpenseDraft = z.output<typeof expenseSchema>;

export const voidExpenseSchema = z.object({
  reason: requiredText({ max: expenseLimits.reasonMax, required: "Say why it's being voided.", tooLong: `Keep the reason under ${expenseLimits.reasonMax} characters.` }),
});

export const supplierSchema = z.object({
  name: requiredText({ max: expenseLimits.supplierNameMax, required: "Enter the supplier's name.", tooLong: `Keep the name under ${expenseLimits.supplierNameMax} characters.` }),
  notes: optionalText({ max: expenseLimits.supplierNotesMax, tooLong: `Keep the notes under ${expenseLimits.supplierNotesMax} characters.` }),
});

export const bankAccountSchema = z.object({
  name: requiredText({ max: bankLimits.nameMax, required: "Give the account a name, like Business cheque.", tooLong: `Keep the name under ${bankLimits.nameMax} characters.` }),
  bankName: requiredText({ max: bankLimits.bankNameMax, required: "Enter the bank's name.", tooLong: `Keep it under ${bankLimits.bankNameMax} characters.` }),
  accountNumber: z
    .string("Enter the account number.")
    .transform(accountNumberDigits)
    .refine((digits) => digits.length > 0, "Enter the account number.")
    .refine((digits) => /^\d{4,20}$/.test(digits), "Enter the account number in digits, as it is on your statement."),
});

const column = (message: string) => z.coerce.number<string>({ error: message }).int(message).min(0, message).max(statementLimits.maxColumns - 1, message);

const optionalColumn = (message: string) => z.preprocess(blankToUndefined, column(message).optional());

const checkbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());

/** The import form's column choices (columns counted from 0), read into a mapping. */
export const mappingFieldsSchema = z
  .object({
    separator: z.enum(csvSeparators, "Choose what separates the columns."),
    skipRows: z.preprocess(
      (value) => blankToUndefined(value) ?? "0",
      z.coerce.number<string>({ error: "Enter a number of rows." }).int("Enter a whole number of rows.").min(0, "Enter 0 or more.").max(statementLimits.maxSkipRows, `Skip at most ${statementLimits.maxSkipRows} rows.`),
    ),
    hasHeader: checkbox,
    dateColumn: column("Choose the column with the date."),
    dateFormat: z.enum(dateFormats, "Choose how dates are written."),
    descriptionColumn: column("Choose the column with the description."),
    referenceColumn: optionalColumn("Choose a column, or none."),
    amountKind: z.enum(["single", "split"], "Choose how amounts are shown."),
    amountColumn: optionalColumn("Choose the column with the amount."),
    inColumn: optionalColumn("Choose the column with money in."),
    outColumn: optionalColumn("Choose the column with money out."),
    balanceColumn: optionalColumn("Choose a column, or none."),
    decimal: z.enum(decimalMarks, "Choose the decimal mark."),
  })
  .superRefine((value, context) => {
    if (value.amountKind === "single") {
      if (value.amountColumn === undefined) context.addIssue({ code: "custom", path: ["amountColumn"], message: "Choose the column with the amount." });
      else if (value.amountColumn === value.dateColumn) context.addIssue({ code: "custom", path: ["amountColumn"], message: "Choose a different column from the date's." });
    } else {
      if (value.inColumn === undefined) context.addIssue({ code: "custom", path: ["inColumn"], message: "Choose the column with money in." });
      if (value.outColumn === undefined) context.addIssue({ code: "custom", path: ["outColumn"], message: "Choose the column with money out." });
      if (value.inColumn !== undefined && value.inColumn === value.outColumn) context.addIssue({ code: "custom", path: ["outColumn"], message: "Money in and money out need different columns." });
    }
  })
  .transform(
    (value): StatementMapping => ({
      separator: value.separator,
      skipRows: value.skipRows,
      hasHeader: value.hasHeader,
      dateColumn: value.dateColumn,
      dateFormat: value.dateFormat,
      descriptionColumn: value.descriptionColumn,
      referenceColumn: value.referenceColumn ?? null,
      amount: value.amountKind === "single" ? { kind: "single", column: value.amountColumn! } : { kind: "split", inColumn: value.inColumn!, outColumn: value.outColumn! },
      balanceColumn: value.balanceColumn ?? null,
      decimal: value.decimal,
    }),
  );

const storedColumn = z.number().int().min(0).max(statementLimits.maxColumns - 1);

/** A mapping as stored with its account, read back. */
export const storedMappingSchema = z.object({
  separator: z.enum(csvSeparators),
  skipRows: z.number().int().min(0).max(statementLimits.maxSkipRows),
  hasHeader: z.boolean(),
  dateColumn: storedColumn,
  dateFormat: z.enum(dateFormats),
  descriptionColumn: storedColumn,
  referenceColumn: storedColumn.nullable(),
  amount: z.discriminatedUnion("kind", [z.object({ kind: z.literal("single"), column: storedColumn }), z.object({ kind: z.literal("split"), inColumn: storedColumn, outColumn: storedColumn })]),
  balanceColumn: storedColumn.nullable(),
  decimal: z.enum(decimalMarks),
}) satisfies z.ZodType<StatementMapping>;

/** A mapping as the form's fields carry it, to fill the form with a saved one. */
export function mappingFields(mapping: StatementMapping): Record<string, string> {
  return {
    separator: mapping.separator,
    skipRows: String(mapping.skipRows),
    hasHeader: mapping.hasHeader ? "on" : "",
    dateColumn: String(mapping.dateColumn),
    dateFormat: mapping.dateFormat,
    descriptionColumn: String(mapping.descriptionColumn),
    referenceColumn: mapping.referenceColumn === null ? "" : String(mapping.referenceColumn),
    amountKind: mapping.amount.kind,
    amountColumn: mapping.amount.kind === "single" ? String(mapping.amount.column) : "",
    inColumn: mapping.amount.kind === "split" ? String(mapping.amount.inColumn) : "",
    outColumn: mapping.amount.kind === "split" ? String(mapping.amount.outColumn) : "",
    balanceColumn: mapping.balanceColumn === null ? "" : String(mapping.balanceColumn),
    decimal: mapping.decimal,
  };
}

export const lineJournalSchema = z
  .object({
    kind: z.enum(lineKinds, "Choose what the line is."),
    account: z.preprocess(blankToUndefined, accountCode("Choose the account.").optional()),
  })
  .superRefine((value, context) => {
    if ((value.kind === "channel-payout" || value.kind === "transfer" || value.kind === "other") && !value.account) {
      context.addIssue({ code: "custom", path: ["account"], message: value.kind === "channel-payout" ? "Choose the channel." : "Choose the account." });
    }
  });

export const fileNameSchema = z
  .string()
  .transform((name) =>
    (name.split(/[\\/]/).pop() ?? "")
      .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
      .trim()
      .slice(0, bankLimits.fileNameMax),
  )
  .transform((name) => name || "statement.csv");
