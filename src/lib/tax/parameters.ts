import { z } from "zod";
import { formatDateShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { compareIsoDates, type IsoDate } from "@/lib/format/zoned-time";

/**
 * Tax parameters (brief rule 6): every rate, threshold and deadline the tax
 * pages use is dated, versioned config that cites the sars.gov.za page it
 * was checked on. Nothing here is hard-coded: the values live in the
 * database (seeded by migration 340 with what was checked on sars.gov.za
 * when Phase 4 was built) and the owner adds new versions as SARS changes
 * them. A version is never edited: a change is a new version.
 *
 * A version is "verified" when its value was read on a SARS page on the day
 * it says, or "unverified" (no value) when the page wouldn't load, didn't
 * state it plainly, or stated it only for an older year. A return that needs
 * a parameter without a verified value covering its period is refused,
 * naming the parameter.
 */

/** How a parameter's value is kept. */
export const parameterUnits = ["percent", "cents", "years", "table", "rule"] as const;
export type ParameterUnit = (typeof parameterUnits)[number];

/** A sliding tax table: each band taxes `ratePercent` of the amount over `overCents`, plus `baseCents`. */
export type TaxBand = { overCents: number; baseCents: number; ratePercent: number };
export type TaxTable = { bands: TaxBand[] };

/** VAT tax periods (filing categories): each category's length and the months its periods end in ("year-end": the vendor's year of assessment). */
export const vatCategories = ["A", "B", "C", "D", "E"] as const;
export type VatCategory = (typeof vatCategories)[number];
export type VatCategoryRule = { months: number; endMonths: number[] | "year-end"; who: string };
export type VatFilingCategories = Record<VatCategory, VatCategoryRule>;

/** When a VAT201 is due: the `manualDay` of the month after the period ends, or its last business day for eFiling. */
export type VatReturnDue = { manualDay: number; efilingLastBusinessDay: boolean };

/** When provisional tax (IRP6) payments are due. */
export type ProvisionalPeriods = {
  /** The first, this many months after the year of assessment starts (its last day). */
  firstMonthsFromStart: number;
  /** The second, on the last business day of the year of assessment. */
  secondLastBusinessDayOfYear: boolean;
  /** The voluntary third: for individuals and companies with a February year end, the last business day of this month; other companies this many months after the year ends. */
  thirdFebruaryYearEndMonth: number;
  thirdOtherMonthsAfterEnd: number;
};

/** When the EMP201 is due: this many days after the month ends, the business day before when that isn't a business day. */
export type MonthlyDue = { daysAfterMonthEnd: number };

export type UifRates = { employeePercent: number; employerPercent: number };

export type IndividualRebates = { primaryCents: number; secondaryCents: number; tertiaryCents: number };

export type LongStayRule = { afterDays: number; deemedPercent: number };

export type InterimPayments = { firstMonth: number; secondMonth: number };

const percent = z.number().min(0).max(100);
const cents = z.number().int().min(0).max(100_000_000_000);
const month = z.number().int().min(1).max(12);
const tableSchema = z.object({
  bands: z
    .array(z.object({ overCents: cents, baseCents: cents, ratePercent: percent }))
    .min(1)
    .refine((bands) => bands[0]!.overCents === 0 && bands.every((band, index) => index === 0 || band.overCents > bands[index - 1]!.overCents), "Bands start at 0 and rise."),
});
const categoryRule = z.object({ months: z.number().int().min(1).max(12), endMonths: z.union([z.array(month).min(1).max(12), z.literal("year-end")]), who: z.string().max(300) });

/** Each parameter the tax pages use: its plain name, unit, how its value is checked, and what it's for. */
export const parameterCatalogue = {
  "vat.standard-rate": { name: "VAT standard rate", unit: "percent", schema: percent, about: "The rate VAT is charged at on standard-rated supplies." },
  "vat.compulsory-threshold": { name: "VAT compulsory registration threshold", unit: "cents", schema: cents, about: "Taxable supplies over any 12 months above which registering for VAT is compulsory." },
  "vat.voluntary-threshold": { name: "VAT voluntary registration threshold", unit: "cents", schema: cents, about: "Taxable supplies over 12 months above which a business may choose to register." },
  "vat.commercial-accommodation-threshold": {
    name: "Commercial accommodation threshold",
    unit: "cents",
    schema: cents,
    about: "Below this much commercial accommodation in 12 months, supplying it isn't an enterprise for VAT.",
  },
  "vat.long-stay-rule": {
    name: "VAT on long stays",
    unit: "rule",
    schema: z.object({ afterDays: z.number().int().min(1).max(366), deemedPercent: percent }),
    about: "How an all-inclusive charge for a long, unbroken stay is valued for VAT.",
  },
  "vat.filing-categories": {
    name: "VAT filing categories",
    unit: "rule",
    schema: z.object({ A: categoryRule, B: categoryRule, C: categoryRule, D: categoryRule, E: categoryRule }),
    about: "How long each VAT tax period is and the months periods end in.",
  },
  "vat.return-due": {
    name: "VAT201 due date",
    unit: "rule",
    schema: z.object({ manualDay: z.number().int().min(1).max(28), efilingLastBusinessDay: z.boolean() }),
    about: "When a VAT201 and its payment are due after the period ends.",
  },
  "turnover.threshold": { name: "Turnover tax threshold", unit: "cents", schema: cents, about: "The most a year's qualifying turnover may be for turnover tax." },
  "turnover.rate-table": { name: "Turnover tax rates", unit: "table", schema: tableSchema, about: "Turnover tax payable on a year's taxable turnover." },
  "turnover.interim-payments": {
    name: "Turnover tax interim payments",
    unit: "rule",
    schema: z.object({ firstMonth: month, secondMonth: month }),
    about: "When the two interim turnover tax payments are due (the last business day of each month).",
  },
  "provisional.periods": {
    name: "Provisional tax (IRP6) due dates",
    unit: "rule",
    schema: z.object({
      firstMonthsFromStart: z.number().int().min(1).max(12),
      secondLastBusinessDayOfYear: z.boolean(),
      thirdFebruaryYearEndMonth: month,
      thirdOtherMonthsAfterEnd: z.number().int().min(1).max(12),
    }),
    about: "When the first, second and voluntary third provisional payments are due.",
  },
  "paye.emp201-due": { name: "EMP201 due date", unit: "rule", schema: z.object({ daysAfterMonthEnd: z.number().int().min(1).max(28) }), about: "When the monthly EMP201 and its payment are due." },
  "uif.rates": { name: "UIF contribution rates", unit: "rule", schema: z.object({ employeePercent: percent, employerPercent: percent }), about: "The employee's and the employer's UIF contributions, as a share of pay." },
  "uif.ceiling": { name: "UIF earnings ceiling", unit: "cents", schema: cents, about: "The most monthly pay UIF is worked out on." },
  "sdl.rate": { name: "SDL rate", unit: "percent", schema: percent, about: "The Skills Development Levy, as a share of the payroll." },
  "sdl.threshold": { name: "SDL payroll threshold", unit: "cents", schema: cents, about: "Employers whose payroll over the next 12 months won't exceed this needn't register for SDL." },
  "records.keep-years": { name: "Record-keeping period", unit: "years", schema: z.number().int().min(1).max(50), about: "How long records must be kept after a return is submitted." },
  "income-tax.individual-table": { name: "Income tax rates for individuals", unit: "table", schema: tableSchema, about: "Tax on a year's taxable income, for a sole proprietor." },
  "income-tax.individual-rebates": {
    name: "Income tax rebates for individuals",
    unit: "rule",
    schema: z.object({ primaryCents: cents, secondaryCents: cents, tertiaryCents: cents }),
    about: "The rebates taken off an individual's tax (primary for everyone; more from 65 and 75).",
  },
  "income-tax.company-rate": { name: "Company income tax rate", unit: "percent", schema: percent, about: "The rate a company pays on its taxable income." },
  "income-tax.sbc-table": { name: "Small business corporation rates", unit: "table", schema: tableSchema, about: "Tax on a qualifying small business corporation's taxable income." },
} as const satisfies Record<string, { name: string; unit: ParameterUnit; schema: z.ZodType; about: string }>;

export type ParameterCode = keyof typeof parameterCatalogue;

export const parameterCodes = Object.keys(parameterCatalogue) as ParameterCode[];

export function isParameterCode(value: unknown): value is ParameterCode {
  return typeof value === "string" && Object.hasOwn(parameterCatalogue, value);
}

/** The value each code holds. */
export type ParameterValue<Code extends ParameterCode> = z.output<(typeof parameterCatalogue)[Code]["schema"]>;

export type ParameterStatus = "verified" | "unverified";

/** One version of a parameter, as stored. */
export type TaxParameter = {
  id: string;
  code: ParameterCode;
  /** 1, 2, 3…: per code, in the order they were added. */
  version: number;
  /** The value read on SARS's page; null when unverified. */
  value: unknown;
  unit: ParameterUnit;
  effectiveFrom: IsoDate;
  /** The last day it applies, when SARS says; null for open-ended. */
  effectiveTo: IsoDate | null;
  /** The exact sars.gov.za page it was read on (or tried, when unverified). */
  sourceUrl: string;
  sourceTitle: string;
  checkedOn: IsoDate;
  checkedBy: string;
  /** What the page says, quoted or closely paraphrased, or why it couldn't be verified. */
  note: string;
  status: ParameterStatus;
  createdAt: Date;
  /** Who added it; null for the seed. */
  createdBy: string | null;
};

/** A version as it's added (the store numbers it). */
export type NewTaxParameter = Omit<TaxParameter, "version">;

/** Whether a version was seeded when the app was built (by migration 340) rather than added by the owner. */
export function isBuildSeeded(parameter: Pick<TaxParameter, "createdBy">): boolean {
  return parameter.createdBy === null;
}

/**
 * Who checked a version on sars.gov.za, and when: "Checked on sars.gov.za
 * on 12 Nov 2026, during the build" for the seed, "Checked 3 Mar 2027 by
 * Nico" for a version the owner added.
 */
export function checkedText(parameter: Pick<TaxParameter, "checkedOn" | "checkedBy" | "createdBy">): string {
  const day = formatDateShort(parameter.checkedOn);
  return isBuildSeeded(parameter) ? `Checked on sars.gov.za on ${day}, during the build` : `Checked ${day} by ${parameter.checkedBy}`;
}

/** Whether a page is on SARS's own site: https on sars.gov.za or www.sars.gov.za, nothing else. */
export function isSarsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && (url.hostname === "www.sars.gov.za" || url.hostname === "sars.gov.za") && url.username === "" && url.password === "" && url.port === "";
}

/** Whether a version applies on a date. */
export function covers(parameter: Pick<TaxParameter, "effectiveFrom" | "effectiveTo">, date: IsoDate): boolean {
  return compareIsoDates(parameter.effectiveFrom, date) <= 0 && (parameter.effectiveTo === null || compareIsoDates(date, parameter.effectiveTo) <= 0);
}

/** A parameter's value on a date, or why there isn't a usable one. */
export type ParameterLookup<Code extends ParameterCode> =
  | { status: "verified"; parameter: TaxParameter; value: ParameterValue<Code> }
  | { status: "missing"; code: Code; date: IsoDate; reason: "none" | "unverified" | "invalid"; message: string };

/**
 * The version of `code` that applies on `date`: of those covering it, the
 * latest added. That one must be verified, with a value of the right shape;
 * otherwise the answer says what's missing. A newer unverified version
 * deliberately hides an older verified one: it's how the owner says "this
 * may have changed".
 */
export function lookUp<Code extends ParameterCode>(parameters: readonly TaxParameter[], code: Code, date: IsoDate): ParameterLookup<Code> {
  const name = parameterCatalogue[code].name;
  const candidates = parameters.filter((parameter) => parameter.code === code && covers(parameter, date)).sort((a, b) => b.version - a.version);
  const latest = candidates[0];
  if (!latest) return { status: "missing", code, date, reason: "none", message: `${name} has no value covering ${date}. Add one checked on sars.gov.za under Tax › Rates and dates.` };
  if (latest.status !== "verified" || latest.value === null) {
    return { status: "missing", code, date, reason: "unverified", message: `${name} isn't verified for ${date}: ${latest.note}` };
  }
  const parsed = parameterCatalogue[code].schema.safeParse(latest.value);
  if (!parsed.success) return { status: "missing", code, date, reason: "invalid", message: `${name} (version ${latest.version}) doesn't hold a value the app can read. Add a corrected version.` };
  return { status: "verified", parameter: latest, value: parsed.data as ParameterValue<Code> };
}

/** The current version of every code on a date, for the parameters page: verified, unverified or none at all. */
export function parameterStates(parameters: readonly TaxParameter[], date: IsoDate): { code: ParameterCode; current: TaxParameter | null; lookup: ParameterLookup<ParameterCode>; versions: TaxParameter[] }[] {
  return parameterCodes.map((code) => {
    const versions = parameters.filter((parameter) => parameter.code === code).sort((a, b) => b.version - a.version);
    const current = versions.filter((parameter) => covers(parameter, date))[0] ?? versions[0] ?? null;
    return { code, current, lookup: lookUp(parameters, code, date), versions };
  });
}

/** Tax under a sliding table, in cents (rounded to the cent). Nothing is due on nothing. */
export function taxOnTable(table: TaxTable, amountCents: number): number {
  if (amountCents <= 0) return 0;
  const band = [...table.bands].reverse().find((candidate) => amountCents > candidate.overCents) ?? table.bands[0]!;
  return band.baseCents + Math.round(((amountCents - band.overCents) * band.ratePercent) / 100);
}

/** `ratePercent` of an amount, rounded to the cent. */
export function percentOf(amountCents: number, ratePercent: number): number {
  return Math.round((amountCents * ratePercent) / 100);
}

/** A value as the parameters page shows it: "15%", "R2,300,000", "5 years", or a short summary of a table or rule. */
export function describeValue(code: ParameterCode, value: unknown): string {
  if (value === null || value === undefined) return "Not verified";
  const unit = parameterCatalogue[code].unit;
  if (unit === "percent" && typeof value === "number") return `${value}%`;
  if (unit === "cents" && typeof value === "number") return formatCents(value);
  if (unit === "years" && typeof value === "number") return `${value} years`;
  const parsed = parameterCatalogue[code].schema.safeParse(value);
  if (!parsed.success) return "Can't be read";
  switch (code) {
    case "turnover.rate-table":
    case "income-tax.individual-table":
    case "income-tax.sbc-table": {
      const bands = (parsed.data as TaxTable).bands;
      return `${bands.length} bands, ${bands[0]!.ratePercent}% to ${bands[bands.length - 1]!.ratePercent}%`;
    }
    case "vat.long-stay-rule": {
      const rule = parsed.data as LongStayRule;
      return `Over ${rule.afterDays} days: ${rule.deemedPercent}% of the all-inclusive charge`;
    }
    case "vat.filing-categories":
      return "Categories A to E";
    case "vat.return-due": {
      const rule = parsed.data as VatReturnDue;
      return `${ordinal(rule.manualDay)} of the next month${rule.efilingLastBusinessDay ? "; eFiling: its last business day" : ""}`;
    }
    case "provisional.periods":
      return "First, second and voluntary third payments";
    case "paye.emp201-due":
      return `${(parsed.data as MonthlyDue).daysAfterMonthEnd} days after the month ends`;
    case "uif.rates": {
      const rates = parsed.data as UifRates;
      return `${rates.employeePercent}% employee, ${rates.employerPercent}% employer`;
    }
    case "income-tax.individual-rebates":
      return `Primary ${formatCents((parsed.data as IndividualRebates).primaryCents)}`;
    case "turnover.interim-payments": {
      const rule = parsed.data as InterimPayments;
      return `Last business day of months ${rule.firstMonth} and ${rule.secondMonth}`;
    }
    default:
      return JSON.stringify(parsed.data);
  }
}

function ordinal(day: number): string {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}
