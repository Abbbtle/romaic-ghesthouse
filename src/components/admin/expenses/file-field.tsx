"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { cx } from "@/components/ui/cx";
import { useFormField } from "@/components/ui/form";
import { errorClasses, hintClasses, labelClasses } from "@/components/ui/form-controls";

/**
 * A file picker with a visible label, "(optional)" when it is, and one
 * message slot (the hint, or the error from its form), like the other
 * fields. The browser's own button does the choosing, so it works with the
 * keyboard and on phones (camera or files).
 */
export function FileField({
  name,
  label,
  accept,
  hint,
  optional = false,
  busy,
  problem,
  inputRef,
  onFile,
  className,
}: {
  name: string;
  label: string;
  accept: string;
  hint?: ReactNode;
  optional?: boolean;
  /** Shown instead of the hint while the chosen file is being prepared. */
  busy?: string | null;
  /** What's wrong with the file just chosen, found in the browser (the form's own error comes first). */
  problem?: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFile?: (file: File | null, input: HTMLInputElement) => void;
  className?: string;
}) {
  const wiring = useFormField(name);
  const message = busy ?? hint;
  const error = wiring.error ?? problem ?? undefined;
  return (
    <div className={className}>
      <label htmlFor={wiring.id} className={cx("block", labelClasses)}>
        {label}
        {optional && <span className="font-normal text-fg-3"> (optional)</span>}
      </label>
      <input
        ref={inputRef}
        id={wiring.id}
        name={name}
        type="file"
        accept={accept}
        required={!optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? wiring.errorId : message ? wiring.hintId : undefined}
        onChange={(event) => onFile?.(event.currentTarget.files?.[0] ?? null, event.currentTarget)}
        className="mt-1.5 block w-full min-w-0 text-sm text-fg-2 file:mr-3 file:inline-flex file:min-h-11 file:cursor-pointer file:items-center file:rounded-sm file:border-[1.5px] file:border-btn-secondary-border file:bg-btn-secondary-bg file:px-4 file:text-sm file:font-bold file:text-btn-secondary-fg hover:file:bg-btn-secondary-hover aria-invalid:text-danger-fg"
      />
      {error ? (
        <p id={wiring.errorId} role={wiring.error ? undefined : "alert"} className={cx("mt-1.5", errorClasses)}>
          <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      ) : message ? (
        <p id={wiring.hintId} className={cx("mt-1.5", hintClasses)} aria-live={busy ? "polite" : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
