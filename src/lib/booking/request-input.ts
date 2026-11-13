import { z } from "zod";
import { optionalEmail, optionalText, phoneNumber, requiredText } from "@/lib/forms/fields";
import { parseWith, type Parsed } from "@/lib/forms/parse";
import { isIsoDate, type IsoDate } from "@/lib/format/zoned-time";

/**
 * What the booking request form sends, and how it's read. The schema runs
 * in the browser for instant feedback and again on the server, which always
 * re-validates and re-checks availability. The honeypot and the signed form
 * token aren't part of it: only the server reads them (botSignalsOf).
 */

/**
 * A field people never see; bots fill it in. Render it off-screen with
 * autoComplete="off" and tabIndex -1. Its name and label must mean nothing
 * to browser autofill, which ignores autoComplete="off" for addresses: a
 * field called "company" gets filled from a saved address, and a real
 * request is then dropped as a bot's.
 */
export const honeypotFieldName = "rg_hp";

/** The honeypot's label, for bots that read labels: plain words no autofill rule matches. */
export const honeypotLabel = "Leave this empty";

/** The hidden field carrying the signed time the form was shown. */
export const formTokenFieldName = "formToken";

export const requestFieldLimits = {
  nameMin: 2,
  nameMax: 80,
  arrivalTimeMax: 40,
  notesMax: 500,
  declineNoteMax: 200,
  maxGuests: 12,
} as const;

/** The hint under the notes box (POPIA: collect only what's needed). */
export const requestNotesHint = "Anything we should know, like a late arrival. Please don't include ID numbers, card details or health information.";

/** What a guest asks for, read and checked. */
export type RequestDraft = {
  apartment: string;
  arrive: IsoDate;
  leave: IsoDate;
  adults: number;
  children: number;
  name: string;
  phone: string;
  email: string | null;
  arrivalTime: string | null;
  notes: string | null;
};

/** Text that belongs on one line (a name), with any run of spaces, tabs or line breaks as one space. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ");
}

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);

function count({ min, max, message }: { min: number; max: number; message: string }) {
  return z.coerce.number(message).int(message).min(min, message).max(max, message);
}

/** The booking request form. Dates and the apartment come from the search the guest made; the rest they type. */
export const requestInputSchema = z
  .object({
    apartment: z.string("Choose a room.").trim().min(1, "Choose a room.").max(48, "Choose a room."),
    arrive: isoDay("Choose the day you arrive."),
    leave: isoDay("Choose the day you leave."),
    adults: count({ min: 1, max: requestFieldLimits.maxGuests, message: "Enter how many adults, at least 1." }),
    children: count({ min: 0, max: requestFieldLimits.maxGuests - 1, message: "Enter how many children, or 0." }),
    name: requiredText({
      min: requestFieldLimits.nameMin,
      max: requestFieldLimits.nameMax,
      required: "Enter your name so we know who's coming.",
      tooShort: "Enter your first name and surname.",
      tooLong: `Keep your name under ${requestFieldLimits.nameMax} characters.`,
    }).transform(singleLine),
    phone: phoneNumber({
      required: "Enter your mobile number so we can WhatsApp or call you.",
      invalid: "Enter a mobile number, like 082 123 4567 or +27 82 123 4567.",
    }),
    email: optionalEmail({ invalid: "Enter an email address, like name@example.com, or leave it empty.", tooLong: "That email address is too long." }),
    arrivalTime: optionalText({ max: requestFieldLimits.arrivalTimeMax, tooLong: `Keep this under ${requestFieldLimits.arrivalTimeMax} characters.` }).transform(
      (text) => (text === null ? null : singleLine(text)),
    ),
    notes: optionalText({ max: requestFieldLimits.notesMax, tooLong: `Keep your note under ${requestFieldLimits.notesMax} characters.` }),
    consent: z
      .preprocess((value) => value === "on" || value === true || value === "true", z.boolean())
      .refine((ticked) => ticked, "Tick the box to agree, so we can reply to your request."),
  })
  .superRefine((fields, context) => {
    if (fields.leave <= fields.arrive) context.addIssue({ code: "custom", message: "Choose a leaving day after the arrival day.", path: ["leave"] });
    if (fields.adults + fields.children > requestFieldLimits.maxGuests) {
      context.addIssue({ code: "custom", message: `For more than ${requestFieldLimits.maxGuests} guests, WhatsApp or call us.`, path: ["children"] });
    }
  })
  .transform(
    ({ apartment, arrive, leave, adults, children, name, phone, email, arrivalTime, notes }): RequestDraft => ({
      apartment,
      arrive,
      leave,
      adults,
      children,
      name,
      phone,
      email,
      arrivalTime,
      notes,
    }),
  );

export function parseRequestInput(input: unknown): Parsed<RequestDraft> {
  return parseWith(requestInputSchema, input);
}

function fieldOf(input: unknown, name: string): unknown {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>)[name] : undefined;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** What gives a bot away, read on the server before anything else. */
export type BotSignals = {
  /** Something was typed into the field people never see. */
  honeypotFilled: boolean;
  /** The signed form token, if one came back. */
  formToken: string | null;
};

export function botSignalsOf(input: unknown): BotSignals {
  const token = fieldOf(input, formTokenFieldName);
  return {
    honeypotFilled: !isBlank(fieldOf(input, honeypotFieldName)),
    formToken: typeof token === "string" && token.trim() !== "" ? token.trim() : null,
  };
}

/** What a bot's submission seems to ask for, so its decoy receipt echoes it like a real one; unreadable parts get stand-ins. */
export function echoedRequestOf(input: unknown, today: IsoDate): Pick<RequestDraft, "apartment" | "arrive" | "leave" | "adults" | "children"> {
  const read = (name: string) => {
    const value = fieldOf(input, name);
    return typeof value === "string" ? value : "";
  };
  const arrive = isIsoDate(read("arrive")) ? read("arrive") : today;
  const leave = isIsoDate(read("leave")) && read("leave") > arrive ? read("leave") : arrive;
  const adults = Number.parseInt(read("adults"), 10);
  return {
    apartment: read("apartment").slice(0, 48),
    arrive,
    leave,
    adults: Number.isInteger(adults) && adults > 0 && adults <= requestFieldLimits.maxGuests ? adults : 2,
    children: 0,
  };
}

/** Declining: an optional private note ("full that week", "asked to cancel"). */
export const declineInputSchema = z.object({
  note: optionalText({ max: requestFieldLimits.declineNoteMax, tooLong: `Keep the note under ${requestFieldLimits.declineNoteMax} characters.` }),
});

