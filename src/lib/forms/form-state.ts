import { formErrorKey, type ChangeResult, type FieldErrors } from "@/lib/kernel/result";

/** What a dashboard form's server action reports back. */
export type FormState =
  | { status: "idle" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "saved"; message: string }
  | { status: "failed"; message: string };

export const idleFormState: FormState = { status: "idle" };

/** The submit handler a form calls, shaped for useActionState. */
export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export const savedState = (message = "Saved."): FormState => ({ status: "saved", message });

export const failedState = (message: string): FormState => ({ status: "failed", message });

/**
 * Field problems from a reader or a service. A problem with the whole form
 * (the "form" key) on its own is shown as a failure message rather than
 * next to a field.
 */
export function invalidState(errors: FieldErrors): FormState {
  const { [formErrorKey]: whole, ...fields } = errors;
  if (whole && Object.keys(fields).length === 0) return failedState(whole);
  return { status: "invalid", errors };
}

/** How a service's answer reads on the form: saved with `savedMessage`, or its problems. */
export function formStateOf(result: ChangeResult<object>, savedMessage?: string): FormState {
  return result.ok ? savedState(savedMessage) : invalidState(result.errors);
}
