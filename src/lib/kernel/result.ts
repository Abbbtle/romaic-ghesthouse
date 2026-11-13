/**
 * How services report a change: done (with anything the caller needs, such as
 * a new record's id), or refused with messages keyed by field. A problem with
 * the whole request goes under `formErrorKey`. Changes with more outcomes than
 * that have their own `status` unions (for example a booking request that can
 * also be rate limited).
 */

/** Messages keyed by field name. Nested fields use dotted paths, such as "plans.0.price". */
export type FieldErrors = Record<string, string>;

/** The key for a problem that belongs to no single field, such as "That session no longer exists". */
export const formErrorKey = "form";

export type ChangeResult<Details extends object = Record<never, never>> = ({ ok: true } & Details) | { ok: false; errors: FieldErrors };

export function done(): ChangeResult;
export function done<Details extends object>(details: Details): ChangeResult<Details>;
export function done<Details extends object>(details?: Details): ChangeResult<Details> {
  return { ok: true, ...(details as Details) };
}

export function refused(errors: FieldErrors): { ok: false; errors: FieldErrors } {
  return { ok: false, errors };
}

/** Refused for a reason that concerns the whole request. */
export function refusedWith(message: string): { ok: false; errors: FieldErrors } {
  return { ok: false, errors: { [formErrorKey]: message } };
}
