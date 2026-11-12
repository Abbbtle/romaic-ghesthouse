"use client";

import { useId } from "react";
import { cx } from "./cx";
import { useFormField } from "./form";
import { errorClasses, hintClasses, labelClasses } from "./form-controls";

type CodeInputProps = {
  /** The form field's name, such as "code". */
  name: string;
  label?: string;
  hint?: string;
  error?: string | null;
  /** Six digits for an authenticator code; recovery codes are longer and contain letters. */
  kind?: "totp" | "recovery";
  autoFocus?: boolean;
  disabled?: boolean;
  defaultValue?: string;
  className?: string;
};

/**
 * One field for a sign-in code: an authenticator app's 6 digits, or a
 * recovery code. One input (not six boxes), so pasting, password managers,
 * iOS "From Messages" autofill and screen readers all work: numeric keypad
 * on phones, one-time-code autocomplete, wide tracking and tabular figures
 * so it reads like the code on the phone.
 */
export function CodeInput({ name, label, hint, error: explicitError, kind = "totp", autoFocus, disabled, defaultValue, className }: CodeInputProps) {
  // Inside a ValidatedForm (SubmitForm), the form's ids and errors; on its own, its own ids and the error passed in.
  const wiring = useFormField(name);
  const ownId = useId();
  const id = wiring.id || ownId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = explicitError ?? wiring.error ?? null;
  const totp = kind === "totp";
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className={labelClasses}>
        {label ?? (totp ? "Code from your authenticator app" : "Recovery code")}
      </label>
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        type="text"
        inputMode={totp ? "numeric" : "text"}
        pattern={totp ? "[0-9 ]*" : undefined}
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={totp ? 7 : 24}
        placeholder={totp ? "123 456" : "123456 or xxxxx-xxxxx"}
        required
        autoFocus={autoFocus}
        disabled={disabled}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        data-numeric
        className={cx(
          "h-14 w-full max-w-[16rem] rounded-sm border border-control bg-field px-4 text-center font-mono text-2xl tracking-[0.35em] text-fg tabular-nums transition-colors duration-150 placeholder:tracking-[0.2em] placeholder:text-neutral-400 hover:border-control-hover focus:border-focus aria-invalid:border-danger disabled:bg-chalk disabled:text-fg-3",
          !totp && "max-w-[20rem] text-lg tracking-[0.18em]",
        )}
      />
      {error && (
        <p id={errorId} className={errorClasses}>
          {error}
        </p>
      )}
    </div>
  );
}
