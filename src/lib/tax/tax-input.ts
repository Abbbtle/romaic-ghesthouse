import { z } from "zod";
import { optionalText, randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";
import { isParameterCode, isSarsUrl, parameterCatalogue, vatCategories, type ParameterCode } from "./parameters";
import { provisionalPayments } from "./periods";
import { legalForms, registrationKinds } from "./registrations";
import { returnKinds } from "./returns";

/**
 * What the tax and payroll forms send, and how it's read. The services read
 * every field again, whatever the browser checked.
 */

export const taxLimits = {
  noteMax: 1000,
  titleMax: 200,
  urlMax: 500,
  referenceMax: 30,
  nameMax: 120,
  reasonMax: 200,
  /** R1,000,000 a month: more than any pay here, so a slip of extra zeros is caught. */
  maxPayCents: 100_000_000,
} as const;

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);
const optionalDay = (message: string) => z.preprocess((value) => (value === "" || value === undefined ? null : value), z.string(message).refine(isIsoDate, message).nullable());
const monthField = (message: string) => z.string(message).regex(/^\d{4}-(0[1-9]|1[0-2])$/, message);
const yes = z.preprocess((value) => value === "on" || value === "true" || value === "yes" || value === true, z.boolean());

// --- parameters ---------------------------------------------------------------------------

export const parameterVersionSchema = z
  .object({
    code: z.string("Choose the parameter.").refine(isParameterCode, "Choose the parameter."),
    status: z.enum(["verified", "unverified"], "Say whether the value was confirmed on sars.gov.za."),
    value: optionalText({ max: 4000, tooLong: "That value is too long." }),
    effectiveFrom: isoDay("Choose the day it applies from."),
    effectiveTo: optionalDay("Choose the last day it applies, or leave it empty."),
    sourceUrl: requiredText({ max: taxLimits.urlMax, required: "Paste the sars.gov.za page you read it on.", tooLong: "That address is too long." }).refine(
      isSarsUrl,
      "Use a page on sars.gov.za (starting https://www.sars.gov.za/). Values from other sites can't be used.",
    ),
    sourceTitle: requiredText({ max: taxLimits.titleMax, required: "Give the page's title.", tooLong: `Keep the title under ${taxLimits.titleMax} characters.` }),
    checkedOn: isoDay("Choose the day you checked it."),
    note: requiredText({ max: taxLimits.noteMax, required: "Quote what the page says (or why it couldn't be confirmed).", tooLong: `Keep the note under ${taxLimits.noteMax} characters.` }),
  })
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) context.addIssue({ code: "custom", path: ["effectiveTo"], message: "The last day can't be before the first." });
    if (value.status === "verified" && !value.value) context.addIssue({ code: "custom", path: ["value"], message: "Enter the value as the page states it." });
  });

const percentText = z.string().regex(/^\d{1,3}(\.\d{1,4})?$/);

/** A parameter's value from the form: a percentage, an amount in rand, whole years, or JSON for a table or rule, checked against its shape. */
export function parameterValueFrom(code: ParameterCode, text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const entry = parameterCatalogue[code];
  const trimmed = text.trim();
  let candidate: unknown;
  switch (entry.unit) {
    case "percent":
      if (!percentText.safeParse(trimmed.replace(/%$/, "")).success) return { ok: false, message: "Enter the rate as a number, like 15 or 15.5." };
      candidate = Number(trimmed.replace(/%$/, ""));
      break;
    case "cents": {
      const parsed = randAmount({ required: "Enter the amount in rand.", invalid: "Enter the amount in rand, like 2300000." }).safeParse(trimmed);
      if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter the amount in rand." };
      candidate = parsed.data;
      break;
    }
    case "years":
      if (!/^\d{1,2}$/.test(trimmed)) return { ok: false, message: "Enter a whole number of years." };
      candidate = Number(trimmed);
      break;
    default:
      try {
        candidate = JSON.parse(trimmed);
      } catch {
        return { ok: false, message: "Enter the table or rule as JSON, in the same shape as the current version." };
      }
  }
  const checked = entry.schema.safeParse(candidate);
  if (!checked.success) return { ok: false, message: "That value isn't in the shape this parameter needs. Copy the current version's and change it." };
  return { ok: true, value: checked.data };
}

// --- registrations ------------------------------------------------------------------------

export const registrationSchema = z
  .object({
    kind: z.enum(registrationKinds, "Choose the registration."),
    registered: z.enum(["yes", "no"], "Say whether the business is registered."),
    effectiveFrom: optionalDay("Choose the date."),
    reference: z.preprocess(
      (value) => (typeof value === "string" ? value.replace(/\s+/g, "") : value),
      optionalText({ max: taxLimits.referenceMax, tooLong: `Keep the reference under ${taxLimits.referenceMax} characters.` }),
    ),
    vatCategory: z.preprocess((value) => (value === "" ? undefined : value), z.enum(vatCategories).optional()),
    legalForm: z.preprocess((value) => (value === "" ? undefined : value), z.enum(legalForms).optional()),
  })
  .superRefine((value, context) => {
    if (!value.effectiveFrom) {
      context.addIssue({ code: "custom", path: ["effectiveFrom"], message: value.registered === "yes" ? "Choose the date the registration took effect." : "Choose the date it ended." });
    }
    if (value.reference && !/^[0-9A-Za-z/-]+$/.test(value.reference)) context.addIssue({ code: "custom", path: ["reference"], message: "Use the reference as SARS gives it: digits and letters only." });
    if (value.registered === "yes" && value.kind === "vat" && !value.vatCategory) context.addIssue({ code: "custom", path: ["vatCategory"], message: "Choose the filing category on the VAT registration." });
    if (value.registered === "yes" && value.kind === "income-tax" && !value.legalForm) context.addIssue({ code: "custom", path: ["legalForm"], message: "Choose how the business is set up." });
  });

// --- returns ------------------------------------------------------------------------------

export const prepareReturnSchema = z.object({
  kind: z.enum(returnKinds, "Choose the return."),
  /** The month the period ends in: a VAT period's last month, the EMP201's month, or the year of assessment's last month. */
  month: monthField("Choose the period."),
  payment: z.preprocess((value) => (value === "" ? undefined : value), z.enum(provisionalPayments).optional()),
});

export const fileReturnSchema = z.object({
  filedOn: isoDay("Choose the day it was filed on eFiling."),
  submissionReference: optionalText({ max: 40, tooLong: "Keep the reference under 40 characters." }),
});

// --- payroll ------------------------------------------------------------------------------

export const employeeSchema = z
  .object({
    name: requiredText({ max: taxLimits.nameMax, required: "Enter the employee's name.", tooLong: `Keep the name under ${taxLimits.nameMax} characters.` }),
    startDate: isoDay("Choose the day they started."),
    endDate: optionalDay("Choose the day they left, or leave it empty."),
    taxNumber: z.preprocess(
      (value) => (typeof value === "string" ? value.replace(/\s+/g, "") : value),
      optionalText({ max: 20, tooLong: "Enter the tax number as SARS gives it." }),
    ),
    active: yes,
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) context.addIssue({ code: "custom", path: ["endDate"], message: "They can't leave before they started." });
    if (value.taxNumber && !/^\d{5,20}$/.test(value.taxNumber)) context.addIssue({ code: "custom", path: ["taxNumber"], message: "Enter the tax number as digits only." });
  });

const amount = (noun: string, required = true) =>
  z.preprocess(
    (value) => (!required && (value === "" || value === undefined || value === null) ? "0" : value),
    randAmount({
      required: `Enter ${noun} in rand (0 if none).`,
      invalid: `Enter ${noun} in rand, like 8500 or 8500.50.`,
      max: { cents: taxLimits.maxPayCents, message: `Check ${noun}: it's more than R1,000,000.` },
    }),
  );

export const payrollRunSchema = z.object({
  employeeId: z.string("Choose the employee.").min(1, "Choose the employee."),
  period: monthField("Choose the month the pay is for."),
  paidOn: isoDay("Choose the day it was paid."),
  gross: amount("gross pay").refine((cents) => cents > 0, "Enter gross pay of more than R0."),
  paye: amount("PAYE", false),
  uifEmployee: amount("the employee's UIF", false),
  uifEmployer: amount("the employer's UIF", false),
  sdl: amount("SDL", false),
  net: z.preprocess((value) => (value === "" || value === undefined ? null : value), amount("net pay").nullable()),
});

export const reasonSchema = z.object({
  reason: requiredText({ max: taxLimits.reasonMax, required: "Say why.", tooLong: `Keep the reason under ${taxLimits.reasonMax} characters.` }),
});
