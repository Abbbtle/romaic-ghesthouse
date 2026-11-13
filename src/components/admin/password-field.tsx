"use client";

import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { useFormField } from "@/components/ui/form";
import { errorClasses, hintClasses, inputClasses, labelClasses } from "@/components/ui/form-controls";
import { IconButton } from "@/components/ui/icon-button";

type PasswordFieldProps = {
  name: string;
  label: string;
  /** current-password to sign in or confirm who you are; new-password to choose one. */
  autoComplete: "current-password" | "new-password" | "off";
  maxLength: number;
  hint?: ReactNode;
};

/**
 * A password, with a button beside it that shows what's typed (design-spec
 * §10.9), since a phone keyboard makes typos easy. Like the kit's fields it
 * has its label above and one message slot below, and inside a
 * ValidatedForm it picks up its errors. Passwords are never trimmed or
 * capitalised.
 */
export function PasswordField({ name, label, autoComplete, maxLength, hint }: PasswordFieldProps) {
  const wiring = useFormField(name);
  const [revealed, setRevealed] = useState(false);
  const describedBy = wiring.error ? wiring.errorId : hint ? wiring.hintId : undefined;

  return (
    <div>
      <label htmlFor={wiring.id} className={cx("block", labelClasses)}>
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={wiring.id}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          maxLength={maxLength}
          required
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={wiring.error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClasses(wiring.density)}
        />
        <IconButton
          label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          icon={revealed ? <EyeOff /> : <Eye />}
          aria-pressed={revealed}
          align="end"
          onClick={() => setRevealed(!revealed)}
          className="border border-control hover:border-neutral-700"
        />
      </div>
      {wiring.error ? (
        <p id={wiring.errorId} className={cx(errorClasses, "mt-1.5")}>
          <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-danger-600" />
          {wiring.error}
        </p>
      ) : (
        hint && (
          <p id={wiring.hintId} className={cx(hintClasses, "mt-1.5")}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
