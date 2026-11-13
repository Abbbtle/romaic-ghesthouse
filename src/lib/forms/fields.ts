import { z } from "zod";
import { parsePhoneNumber } from "@/lib/format/phone";

/**
 * Field readers every core's input schemas share: text, phone numbers and
 * email addresses. They take what browsers send (FormData strings or JSON
 * values) and give typed, trimmed values; an optional field left empty
 * becomes null. Messages are written for the person filling in the form,
 * so the same schema can run in the browser for instant feedback and on
 * the server, which always re-validates.
 */

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** Nothing, null or only spaces as null; anything else as it is. */
export const blankToNull = (value: unknown): unknown => (isBlank(value) ? null : value);

/** Text that must be filled in: trimmed, at least `min` (default 1) and at most `max` characters. */
export function requiredText(limits: { max: number; min?: number; required: string; tooShort?: string; tooLong: string }) {
  const { max, min = 1, required, tooShort = required, tooLong } = limits;
  return z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z.string(required).trim().min(1, required).min(min, tooShort).max(max, tooLong),
  );
}

/** Text that may be left empty (null): trimmed, at most `max` characters. */
export function optionalText(limits: { max: number; tooLong: string }) {
  return z.preprocess(blankToNull, z.string().trim().max(limits.max, limits.tooLong).nullable());
}

/** A phone number in any common format, kept in E.164 ("+27821234567"). */
export function phoneNumber(messages: { required: string; invalid: string }) {
  return z.string(messages.required).transform((value, context) => {
    const parsed = parsePhoneNumber(value);
    if (parsed.ok) return parsed.e164;
    context.addIssue({ code: "custom", message: parsed.reason === "empty" ? messages.required : messages.invalid });
    return z.NEVER;
  });
}

/** A phone number that may be left empty (null); otherwise kept in E.164. */
export function optionalPhoneNumber(invalid: string) {
  return z.preprocess(
    blankToNull,
    z
      .string(invalid)
      .nullable()
      .transform((value, context) => {
        if (value === null) return null;
        const parsed = parsePhoneNumber(value);
        if (parsed.ok) return parsed.e164;
        context.addIssue({ code: "custom", message: invalid });
        return z.NEVER;
      }),
  );
}

/** An email address that may be left empty (null). */
export function optionalEmail(messages: { invalid: string; tooLong: string }) {
  return z.preprocess(
    (value) => (typeof value === "string" ? blankToNull(value.trim()) : blankToNull(value)),
    z.email(messages.invalid).max(254, messages.tooLong).nullable(),
  );
}
