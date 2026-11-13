import { z } from "zod";
import { blankToNull, optionalPhoneNumber, optionalText, requiredText } from "@/lib/forms/fields";
import { compareIsoDates, isIsoDate } from "@/lib/format/zoned-time";
import { breachStatuses, requestKinds } from "./privacy";

/**
 * What the privacy forms send, and how it's read. The service reads every
 * field again, whatever the browser checked, and checks dates against today
 * itself (a form can't know the server's today).
 */

export const privacyLimits = {
  nameMax: 80,
  contactMax: 200,
  detailsMax: 1000,
  notesMax: 2000,
  outcomeMax: 2000,
  identityNoteMax: 300,
  summaryMax: 2000,
  dataInvolvedMax: 1000,
  actionsMax: 4000,
  referenceMax: 80,
  toldHowMax: 300,
  registrationMax: 40,
  maxPeople: 10_000_000,
} as const;

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

const optionalDay = (message: string) => z.preprocess(blankToNull, z.string(message).refine(isIsoDate, message).nullable());

const tooLong = (what: string, max: number) => `Keep ${what} under ${max} characters.`;

const revision = z.coerce.number("Reload the page and try again.").int("Reload the page and try again.").min(1, "Reload the page and try again.");

// --- the Information Officer ---------------------------------------------------------

export const officerSchema = z.object({
  name: requiredText({ max: privacyLimits.nameMax, min: 2, required: "Enter the Information Officer's name.", tooShort: "Enter their full name.", tooLong: tooLong("the name", privacyLimits.nameMax) }),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.email("Enter an email address people can write to, like privacy@example.com.").max(254, "Check the email address: it's too long."),
  ),
  phone: optionalPhoneNumber("Enter a phone number like 082 123 4567, or leave it empty."),
  registrationReference: optionalText({ max: privacyLimits.registrationMax, tooLong: tooLong("the reference", privacyLimits.registrationMax) }),
});

export type OfficerDraft = z.output<typeof officerSchema>;

// --- data-subject requests ---------------------------------------------------------

const requestFields = {
  kind: z.enum(requestKinds, "Choose what they're asking for."),
  dueOn: isoDay("Choose the day you'll answer by."),
  details: optionalText({ max: privacyLimits.detailsMax, tooLong: tooLong("what they asked", privacyLimits.detailsMax) }),
  notes: optionalText({ max: privacyLimits.notesMax, tooLong: tooLong("the notes", privacyLimits.notesMax) }),
};

export const newRequestSchema = z
  .object({
    ...requestFields,
    requesterName: requiredText({ max: privacyLimits.nameMax, required: "Enter who asked.", tooLong: tooLong("the name", privacyLimits.nameMax) }),
    contact: optionalText({ max: privacyLimits.contactMax, tooLong: tooLong("the contact", privacyLimits.contactMax) }),
    receivedOn: isoDay("Choose the day you received it."),
  })
  .refine((value) => compareIsoDates(value.dueOn, value.receivedOn) >= 0, { path: ["dueOn"], message: "Choose a day on or after the day you received it." });

export type NewRequestDraft = z.output<typeof newRequestSchema>;

export const changeRequestSchema = z.object({ ...requestFields, revision });

export type ChangeRequestDraft = z.output<typeof changeRequestSchema>;

export const answerSchema = z.object({
  closedOn: isoDay("Choose the day you answered."),
  outcome: optionalText({ max: privacyLimits.outcomeMax, tooLong: tooLong("what you did", privacyLimits.outcomeMax) }),
  revision,
});

export const refuseSchema = z.object({
  closedOn: isoDay("Choose the day you told them."),
  outcome: requiredText({ max: privacyLimits.outcomeMax, required: "Say why it's refused: they'll want to know.", tooLong: tooLong("the reason", privacyLimits.outcomeMax) }),
  revision,
});

export const identitySchema = z.object({
  how: requiredText({
    max: privacyLimits.identityNoteMax,
    required: "Say how you checked who they are, such as the phone number on their booking.",
    tooLong: tooLong("how you checked", privacyLimits.identityNoteMax),
  }),
  revision,
});

export const revisionSchema = z.object({ revision });

// --- the breach register -------------------------------------------------------------

const peopleAffected = z.preprocess(
  (value) => {
    const blank = blankToNull(value);
    return typeof blank === "string" ? Number(blank.replace(/[\s,]/g, "")) : blank;
  },
  z
    .number("Enter how many people, as a number, or leave it empty if you don't know yet.")
    .int("Enter a whole number of people.")
    .min(0, "Enter how many people, or leave it empty if you don't know yet.")
    .max(privacyLimits.maxPeople, "Check the number of people.")
    .nullable(),
);

export const breachSchema = z
  .object({
    discoveredOn: isoDay("Choose the day it was discovered."),
    summary: requiredText({ max: privacyLimits.summaryMax, required: "Say what happened.", tooLong: tooLong("what happened", privacyLimits.summaryMax) }),
    dataInvolved: requiredText({
      max: privacyLimits.dataInvolvedMax,
      required: "Say what personal information was involved, such as guests' names and phone numbers.",
      tooLong: tooLong("the information involved", privacyLimits.dataInvolvedMax),
    }),
    peopleAffected,
    status: z.enum(breachStatuses, "Choose whether it's contained."),
    containedOn: optionalDay("Choose the day it was contained."),
    regulatorToldOn: optionalDay("Choose the day the Regulator was told."),
    regulatorReference: optionalText({ max: privacyLimits.referenceMax, tooLong: tooLong("the reference", privacyLimits.referenceMax) }),
    peopleToldOn: optionalDay("Choose the day the people affected were told."),
    peopleToldHow: optionalText({ max: privacyLimits.toldHowMax, tooLong: tooLong("how they were told", privacyLimits.toldHowMax) }),
    actions: optionalText({ max: privacyLimits.actionsMax, tooLong: tooLong("the actions", privacyLimits.actionsMax) }),
  })
  .superRefine((value, context) => {
    if (value.status === "contained" && !value.containedOn) context.addIssue({ code: "custom", path: ["containedOn"], message: "Choose the day it was contained." });
    const notBefore = (key: "containedOn" | "regulatorToldOn" | "peopleToldOn", message: string) => {
      const day = value[key];
      if (day && compareIsoDates(day, value.discoveredOn) < 0) context.addIssue({ code: "custom", path: [key], message });
    };
    notBefore("containedOn", "Choose a day on or after it was discovered.");
    notBefore("regulatorToldOn", "Choose a day on or after it was discovered.");
    notBefore("peopleToldOn", "Choose a day on or after it was discovered.");
    if (value.peopleToldOn && !value.peopleToldHow) context.addIssue({ code: "custom", path: ["peopleToldHow"], message: "Say how they were told, such as by email." });
  })
  .transform((value) => ({ ...value, containedOn: value.status === "contained" ? value.containedOn : null }));

export type BreachDraft = z.output<typeof breachSchema>;

// --- retention -----------------------------------------------------------------------

export const policyPeriodSchema = z.object({
  period: z.coerce.number("Enter a whole number.").int("Enter a whole number."),
});

// --- anonymising a guest -------------------------------------------------------------

export const anonymiseSchema = z.object({
  /** The guest's name as the owner saw it when they confirmed: a guest whose name changed since isn't anonymised. */
  confirmName: z.string("Reload the page and try again.").min(1, "Reload the page and try again.").max(80, "Reload the page and try again."),
  /** The request it answers, if any (recorded in the activity log). */
  requestId: z.preprocess(blankToNull, z.string().max(64).nullable()).optional(),
});
