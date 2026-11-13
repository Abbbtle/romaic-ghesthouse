import { compareIsoDates, type IsoDate } from "@/lib/format/zoned-time";
import type { VatCategory } from "./parameters";

/**
 * The business's tax registrations. Nothing is known yet (open questions
 * #1–#3): every one starts as "not set", and each part of the tax pages
 * switches on only once the owner records the registration, with the date
 * it took effect and, where there is one, its reference number (kept
 * encrypted; only its last digits are ever shown). A change is a new record;
 * the history stays.
 */

export const registrationKinds = ["vat", "turnover", "income-tax", "paye", "uif", "sdl"] as const;
export type RegistrationKind = (typeof registrationKinds)[number];

export const registrationNames: Record<RegistrationKind, string> = {
  vat: "VAT",
  turnover: "Turnover tax",
  "income-tax": "Income tax (provisional tax)",
  paye: "PAYE (employer)",
  uif: "UIF",
  sdl: "Skills Development Levy",
};

export const registrationHelp: Record<RegistrationKind, string> = {
  vat: "Switches on VAT201 preparation. Until then, the overview watches your income against the registration threshold.",
  turnover: "Switches on the turnover tax return.",
  "income-tax": "Switches on the provisional tax (IRP6) worksheet. Say whether the business is a sole proprietor or a company.",
  paye: "Switches on the EMP201 and, with UIF or SDL, payroll.",
  uif: "Switches on payroll records.",
  sdl: "Switches on payroll records and the SDL check on each run.",
};

/** How the business is set up for income tax: decides which tax table the IRP6 estimate uses. */
export const legalForms = ["sole-proprietor", "company", "small-business-corporation"] as const;
export type LegalForm = (typeof legalForms)[number];

export const legalFormNames: Record<LegalForm, string> = {
  "sole-proprietor": "Sole proprietor (the owner pays as an individual)",
  company: "Company",
  "small-business-corporation": "Company taxed as a small business corporation",
};

export type RegistrationDetails = { vatCategory?: VatCategory; legalForm?: LegalForm };

/** A registration as the pages see it: never the reference number itself. */
export type Registration = {
  id: string;
  kind: RegistrationKind;
  registered: boolean;
  /** When it took effect (or ended, for a deregistration). */
  effectiveFrom: IsoDate | null;
  /** The reference number's last digits, when one was given. */
  referenceLast4: string | null;
  details: RegistrationDetails;
  recordedAt: Date;
  recordedBy: string | null;
};

/** A registration as it's stored: the reference sealed (src/server binds it to the record's id). */
export type RegistrationRecord = Registration & { referenceSealed: string | null };

/** Each kind's latest record, or null when nothing's been recorded ("not set"). */
export type RegistrationSet = Record<RegistrationKind, Registration | null>;

export function currentRegistrations(history: readonly Registration[]): RegistrationSet {
  const latest = Object.fromEntries(registrationKinds.map((kind) => [kind, null])) as RegistrationSet;
  for (const record of [...history].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) latest[record.kind] = record;
  return latest;
}

/** Whether the business is registered for `kind` on a date. */
export function registeredOn(registrations: RegistrationSet, kind: RegistrationKind, date: IsoDate): boolean {
  const record = registrations[kind];
  return Boolean(record?.registered && record.effectiveFrom && compareIsoDates(record.effectiveFrom, date) <= 0);
}

/** Whether payroll is on: registered as an employer for PAYE, UIF or SDL. */
export function payrollOn(registrations: RegistrationSet): boolean {
  return (["paye", "uif", "sdl"] as const).some((kind) => registrations[kind]?.registered);
}

/** The last digits shown for a reference number: up to four. */
export function lastDigits(reference: string): string {
  return reference.replace(/[^0-9A-Za-z]/g, "").slice(-4);
}

/** "•••• 1234". */
export function maskedReference(last4: string | null): string | null {
  return last4 ? `•••• ${last4}` : null;
}
