import { z } from "zod";
import { optionalEmail, optionalPhoneNumber, optionalText, randAmount, requiredText } from "@/lib/forms/fields";
import { isIsoDate } from "@/lib/format/zoned-time";

/**
 * What the dashboard's booking forms send, and how it's read. The service
 * reads every field again, whatever the browser checked.
 */

export const bookingFieldLimits = {
  guestNameMax: 80,
  serviceNotesMax: 300,
  notesMax: 1000,
  externalRefMax: 60,
  cancelReasonMax: 200,
  maxGuests: 12,
  /** R1,000,000: more than any stay here could cost, so a typo of extra zeros is caught. */
  maxCents: 100_000_000,
} as const;

const isoDay = (message: string) => z.string(message).refine(isIsoDate, message);
const count = (min: number, max: number, message: string) => z.coerce.number(message).int(message).min(min, message).max(max, message);
const channelKey = z
  .string("Choose where the booking came from.")
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Choose where the booking came from.")
  .max(32, "Choose where the booking came from.");

const money = (noun: string) =>
  randAmount({
    required: `Enter ${noun} in rand, or 0.`,
    invalid: `Enter ${noun} in rand, like 1250 or 1250.50.`,
    max: { cents: bookingFieldLimits.maxCents, message: `Check ${noun}: it's more than R1,000,000.` },
  });

/** The parts of a booking every form edits: the stay, the party, the money and the notes. */
const stayFields = {
  unitId: z.string("Choose the unit.").trim().min(1, "Choose the unit."),
  arrive: isoDay("Choose the arrival day."),
  leave: isoDay("Choose the leaving day."),
  adults: count(1, bookingFieldLimits.maxGuests, "Enter how many adults, at least 1."),
  children: count(0, bookingFieldLimits.maxGuests - 1, "Enter how many children, or 0."),
  total: money("the total"),
  depositDue: money("the deposit due"),
  serviceNotes: optionalText({ max: bookingFieldLimits.serviceNotesMax, tooLong: `Keep the notes for staff under ${bookingFieldLimits.serviceNotesMax} characters.` }),
  notes: optionalText({ max: bookingFieldLimits.notesMax, tooLong: `Keep the private notes under ${bookingFieldLimits.notesMax} characters.` }),
  externalRef: optionalText({ max: bookingFieldLimits.externalRefMax, tooLong: `Keep the channel's booking number under ${bookingFieldLimits.externalRefMax} characters.` }),
  channel: channelKey,
};

function stayRules(fields: { arrive: string; leave: string; adults: number; children: number; total: number; depositDue: number }, context: z.RefinementCtx) {
  if (fields.leave <= fields.arrive) context.addIssue({ code: "custom", path: ["leave"], message: "Choose a leaving day after the arrival day." });
  if (fields.adults + fields.children > bookingFieldLimits.maxGuests) {
    context.addIssue({ code: "custom", path: ["children"], message: `A booking is for at most ${bookingFieldLimits.maxGuests} guests.` });
  }
  if (fields.depositDue > fields.total) context.addIssue({ code: "custom", path: ["depositDue"], message: "Make the deposit no more than the total." });
}

/** The guest on a new booking: an existing record by id, or a new one's details. */
export const guestInputSchema = z.object({
  guestId: optionalText({ max: 64, tooLong: "Choose the guest again." }),
  /** The channel stay this booking is made from, if any (a hidden field on the new-booking form). */
  channelStayId: optionalText({ max: 64, tooLong: "Reload the page and try again." }),
  guestName: optionalText({ max: bookingFieldLimits.guestNameMax, tooLong: `Keep the name under ${bookingFieldLimits.guestNameMax} characters.` }),
  guestPhone: optionalPhoneNumber("Enter a mobile number, like 082 123 4567 or +27 82 123 4567."),
  guestEmail: optionalEmail({ invalid: "Enter an email address, like name@example.com, or leave it empty.", tooLong: "That email address is too long." }),
});

export const newBookingSchema = z
  .object({ ...stayFields, ...guestInputSchema.shape })
  .superRefine((fields, context) => {
    stayRules(fields, context);
    if (!fields.guestId && !fields.guestName) context.addIssue({ code: "custom", path: ["guestName"], message: "Enter the guest's name, or choose a guest." });
    if (!fields.guestId && !fields.guestPhone && !fields.guestEmail) {
      context.addIssue({ code: "custom", path: ["guestPhone"], message: "Enter a phone number or an email address, so you can reach the guest." });
    }
  });

export type NewBookingDraft = z.output<typeof newBookingSchema>;

export const bookingChangeSchema = z
  .object({ ...stayFields, revision: z.coerce.number("Reload the page and try again.").int().min(1) })
  .superRefine(stayRules);

export type BookingChangeDraft = z.output<typeof bookingChangeSchema>;

/** Accepting a booking request: the unit, and the agreed price and deposit (the request carries no money). */
export const acceptRequestSchema = z
  .object({
    unitId: stayFields.unitId,
    total: stayFields.total,
    depositDue: stayFields.depositDue,
  })
  .superRefine((fields, context) => {
    if (fields.depositDue > fields.total) context.addIssue({ code: "custom", path: ["depositDue"], message: "Make the deposit no more than the total." });
  });

export const cancelSchema = z.object({
  reason: optionalText({ max: bookingFieldLimits.cancelReasonMax, tooLong: `Keep the reason under ${bookingFieldLimits.cancelReasonMax} characters.` }),
});

export const guestChangeSchema = z.object({
  name: requiredText({ max: bookingFieldLimits.guestNameMax, required: "Enter the guest's name.", tooLong: `Keep the name under ${bookingFieldLimits.guestNameMax} characters.` }),
  phone: optionalPhoneNumber("Enter a mobile number, like 082 123 4567 or +27 82 123 4567."),
  email: optionalEmail({ invalid: "Enter an email address, like name@example.com, or leave it empty.", tooLong: "That email address is too long." }),
  notes: optionalText({ max: 1000, tooLong: "Keep the notes under 1,000 characters." }),
});
