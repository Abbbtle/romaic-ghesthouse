import type { z } from "zod";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";

/**
 * A form's fields checked with the schema its server action reads them
 * with: the problems by field name, or none. For forms whose fields are
 * named as the schema's keys, such as sign-in and the team forms.
 */
export function formValidator(schema: z.ZodType): (data: FormData) => FieldErrors {
  return (data) => {
    const parsed = parseWith(schema, Object.fromEntries(data));
    return parsed.ok ? {} : parsed.errors;
  };
}
