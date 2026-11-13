"use client";

import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { formErrorKey, type FieldErrors } from "@/lib/kernel/result";
import type { FieldDensity } from "./form-controls";
import { preferredScrollBehavior } from "./motion";
import { Notice } from "./notice";

type FormFieldsContextValue = {
  /** The message to show for a field now, if any. */
  errorFor(key: string): string | undefined;
  /** A unique id for a field's control, so labels and messages can point at it. */
  idFor(name: string): string;
  density: FieldDensity;
  /** Tells the form something changed that fired no input event (a row added, removed or moved). */
  notifyChange(): void;
};

const FormFieldsContext = createContext<FormFieldsContextValue | null>(null);

const noop = () => {};

/** Everything one field needs from its form: ids for its label and messages, its current error, its density. */
export type FieldWiring = {
  id: string;
  hintId: string;
  errorId: string;
  error: string | undefined;
  density: FieldDensity;
  notifyChange(): void;
};

/**
 * Wiring for one field. Inside a ValidatedForm it gets the form's ids, errors
 * and density; on its own (a search box in a GET form) it still gets unique
 * ids, no errors and the compact size.
 */
export function useFormField(name: string, errorKey: string = name): FieldWiring {
  const form = use(FormFieldsContext);
  const standaloneId = useId();
  const id = form ? form.idFor(name) : `${standaloneId}${name.replace(/[^\w-]/g, "_")}`;
  return {
    id,
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    error: form?.errorFor(errorKey),
    density: form?.density ?? "compact",
    notifyChange: form?.notifyChange ?? noop,
  };
}

/** The key a control reports its errors under: its data-error-key, or its name. */
function errorKeyOf(target: EventTarget | null): string | undefined {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return undefined;
  return target.dataset.errorKey || target.name || undefined;
}

function withError(errors: FieldErrors, key: string, message: string | undefined): FieldErrors {
  if (message === errors[key]) return errors;
  const next = { ...errors };
  if (message) next[key] = message;
  else delete next[key];
  return next;
}

/** Field problems, not counting a problem with the whole form. */
function fieldErrorCount(errors: FieldErrors): number {
  return Object.keys(errors).filter((key) => key !== formErrorKey).length;
}

type ValidatedFormProps = Omit<ComponentProps<"form">, "onSubmit" | "onChange" | "onFocus" | "onBlur" | "noValidate" | "children"> & {
  /** Called with the form's data once every field passes `validate`. */
  onValidSubmit: (data: FormData) => void;
  /**
   * The same rules the server applies, run in the browser: field problems
   * keyed by field name or dotted path (an empty object when all is well).
   * The server always checks again.
   */
  validate?: (data: FormData) => FieldErrors;
  /** The server's last answer. Each new object is shown and its first field focused. */
  serverErrors?: FieldErrors;
  /** comfortable (48 px controls) for public forms, compact (44 px) for the dashboard. */
  density?: FieldDensity;
  /** Called on every edit, for unsaved-changes tracking. */
  onEdit?: () => void;
  /** Messages above the fields, such as a failure to save. */
  banner?: ReactNode;
  children: ReactNode;
};

/**
 * A form that checks itself the way people expect (design-spec §11.1): a
 * field is checked when they leave it, never while they type into it; its
 * error clears as soon as they change it; and the submit button always works.
 * Submitting with problems shows them all, focuses the first, and with three
 * or more says how many need attention. Errors from the server land in the
 * same places.
 */
export function ValidatedForm({
  onValidSubmit,
  validate,
  serverErrors,
  density = "compact",
  onEdit,
  banner,
  onReset,
  className,
  children,
  ref,
  ...formProps
}: ValidatedFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const attachForm = (form: HTMLFormElement | null) => {
    formRef.current = form;
    if (typeof ref === "function") return ref(form);
    if (ref) ref.current = form;
  };
  const formId = useId();
  const [shown, setShown] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  // Set while the form itself moves focus to a problem, whose message must stay.
  const focusingProblem = useRef(false);

  // Adopt each new answer from the server while rendering, so its errors show at once.
  const [adoptedServerErrors, setAdoptedServerErrors] = useState(serverErrors);
  if (serverErrors !== adoptedServerErrors) {
    setAdoptedServerErrors(serverErrors);
    if (serverErrors) {
      setShown(serverErrors);
      setSubmitted(true);
      setFocusRequest((count) => count + 1);
    }
  }

  useEffect(() => {
    if (focusRequest === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!first) {
      // A problem with the whole form ("You've already requested this time") shows above the
      // fields, often out of view by the time the person presses the button at the foot.
      formErrorRef.current?.focus({ preventScroll: true });
      formErrorRef.current?.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
      return;
    }
    // A radio group is marked as a whole; its chosen option (or first) takes the focus.
    const control = first.matches("input, select, textarea")
      ? first
      : (first.querySelector<HTMLElement>("input:checked") ?? first.querySelector<HTMLElement>("input, select, textarea") ?? first);
    focusingProblem.current = true;
    control.focus({ preventScroll: true });
    focusingProblem.current = false;
    first.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
  }, [focusRequest]);

  const currentErrors = (form: HTMLFormElement): FieldErrors => validate?.(new FormData(form)) ?? {};

  const clearError = (target: EventTarget | null) => {
    const key = errorKeyOf(target);
    if (key && shown[key]) setShown((errors) => withError(errors, key, undefined));
  };

  // Coming back to a field to fix it clears its message (design-spec §11.1).
  const handleFocus = (event: FocusEvent<HTMLFormElement>) => {
    if (!focusingProblem.current) clearError(event.target);
  };

  const handleBlur = (event: FocusEvent<HTMLFormElement>) => {
    const key = errorKeyOf(event.target);
    if (!key || !validate) return;
    // Moving between the options of one radio group isn't leaving the field.
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next) && errorKeyOf(next) === key) return;
    const message = currentErrors(event.currentTarget)[key];
    setShown((errors) => withError(errors, key, message));
  };

  const handleChange = (event: FormEvent<HTMLFormElement>) => {
    clearError(event.target);
    onEdit?.();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const errors = currentErrors(form);
    setSubmitted(true);
    if (fieldErrorCount(errors) > 0 || errors[formErrorKey]) {
      setShown(errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setShown({});
    // The button that submitted, so a form with two ("Save" and "Save anyway") can tell them apart.
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    onValidSubmit(new FormData(form, submitter));
  };

  const handleReset = (event: FormEvent<HTMLFormElement>) => {
    setShown({});
    setSubmitted(false);
    onReset?.(event);
  };

  const context: FormFieldsContextValue = {
    errorFor: (key) => shown[key],
    idFor: (name) => `${formId}-${name.replace(/[^\w-]/g, "_")}`,
    density,
    notifyChange: () => onEdit?.(),
  };

  const problemCount = fieldErrorCount(shown);
  const formError = shown[formErrorKey];

  return (
    <FormFieldsContext value={context}>
      <form
        // Without an action, a submit before the scripts load would be a GET
        // carrying every field in the address; a POST at least keeps them out of it.
        method={formProps.action === undefined ? "post" : undefined}
        {...formProps}
        ref={attachForm}
        noValidate
        onSubmit={handleSubmit}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onReset={handleReset}
        className={className}
      >
        {(banner || formError || (submitted && problemCount >= 3)) && (
          <div className="mb-6 grid gap-3">
            {banner}
            {formError && (
            <div ref={formErrorRef} tabIndex={-1} className="outline-none">
              <Notice tone="danger">{formError}</Notice>
            </div>
          )}
            {submitted && problemCount >= 3 && <Notice tone="danger">{problemCount} fields need attention.</Notice>}
          </div>
        )}
        {children}
      </form>
    </FormFieldsContext>
  );
}
