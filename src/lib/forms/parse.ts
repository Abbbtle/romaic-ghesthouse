import { z } from "zod";
import { formErrorKey, type FieldErrors } from "@/lib/kernel/result";

/** Untrusted input after validation: the typed value, or messages keyed by field. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/**
 * Validates untrusted input (form fields, JSON from a hidden input, query
 * parameters) with a zod schema. The same call runs in the browser for
 * instant feedback and on the server, which always re-validates.
 */
export function parseWith<Schema extends z.ZodType>(schema: Schema, input: unknown): Parsed<z.output<Schema>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: fieldErrorsOf(result.error) };
}

/**
 * zod's issues as FieldErrors: keyed by dotted path ("plans.0.price"), the
 * first message per field; issues about the whole value go under "form".
 */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : formErrorKey;
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
