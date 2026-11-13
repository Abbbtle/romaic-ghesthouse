"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type ReactNode, type RefObject } from "react";
import { formatRands } from "@/lib/format/money";
import { formatPhoneNumber, parsePhoneNumber } from "@/lib/format/phone";
import { cx } from "./cx";
import { useFormField, type FieldWiring } from "./form";
import { errorClasses, hintClasses, inputClasses, labelClasses, selectClasses, textareaClasses } from "./form-controls";

/*
 * Form fields (design-spec §11.1). Every field has a visible label above it
 * (or one kept for screen readers in repeated rows), "(optional)" when it is
 * optional (fields are required unless they say so), and one message slot
 * below it: the hint, replaced by the error while there is one. Inside a
 * ValidatedForm they pick up its errors, ids and size.
 */

type FieldProps = {
  name: string;
  label: string;
  /** Short guidance under the field. An error replaces it while there is one. */
  hint?: ReactNode;
  /** Marks the label "(optional)". */
  optional?: boolean;
  /** Where the field's error is reported when that differs from its name, e.g. "plans.0.price". */
  errorKey?: string;
  /** Keeps the label for screen readers only, for rows that repeat a visible heading. */
  hideLabel?: boolean;
  className?: string;
};

/** The ids a control should be described by: its error, or its hint, plus any extra message. */
function describedBy(wiring: FieldWiring, hint: ReactNode, extra?: string): string | undefined {
  const ids = [wiring.error ? wiring.errorId : hint ? wiring.hintId : undefined, extra].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldLabel({ wiring, label, optional, hideLabel }: { wiring: FieldWiring; label: string; optional?: boolean; hideLabel?: boolean }) {
  return (
    <label htmlFor={wiring.id} className={cx("block", labelClasses, hideLabel && "sr-only")}>
      {label}
      {optional && <span className="font-normal text-fg-3"> (optional)</span>}
    </label>
  );
}

/** The message slot under a field: the error with its icon, or the hint; a character counter can sit opposite. */
function FieldMessage({
  wiring,
  hint,
  aside,
  spacing = "mt-1.5",
}: {
  wiring: FieldWiring;
  hint?: ReactNode;
  aside?: ReactNode;
  /** The gap above the message; rows that already have padding pass their own. */
  spacing?: string;
}) {
  if (!wiring.error && !hint && !aside) return null;
  return (
    <div className={cx("flex items-start justify-between gap-3", spacing)}>
      {wiring.error ? (
        <p id={wiring.errorId} className={errorClasses}>
          <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-danger" />
          {wiring.error}
        </p>
      ) : hint ? (
        <p id={wiring.hintId} className={hintClasses}>
          {hint}
        </p>
      ) : (
        <span />
      )}
      {aside}
    </div>
  );
}

function controlProps(wiring: FieldWiring, errorKey: string | undefined, hint: ReactNode, extraDescription?: string) {
  return {
    id: wiring.id,
    "aria-invalid": wiring.error ? true : undefined,
    "aria-describedby": describedBy(wiring, hint, extraDescription),
    "data-error-key": errorKey,
  } as const;
}

/**
 * Keeps a count of a control's characters, including after the form is reset
 * (Discard), which changes values without an input event.
 */
function useCharacterCount(control: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, initial: string | undefined) {
  const [count, setCount] = useState(initial?.length ?? 0);
  useEffect(() => {
    const form = control.current?.form;
    if (!form) return;
    // The reset event fires before the values change, so count on the next tick.
    const recount = () => window.setTimeout(() => setCount(control.current?.value.length ?? 0));
    form.addEventListener("reset", recount);
    return () => form.removeEventListener("reset", recount);
  }, [control]);
  return [count, setCount] as const;
}

type SoftLimitProps = {
  /**
   * A design budget: a counter shows under the field and turns to a warning
   * past it, but saving is never blocked (design-spec §10.5).
   */
  softLimit?: number;
  /** What the warning says past the budget. */
  softLimitMessage?: string;
};

/** The counter opposite the message slot, and the polite warning past the budget. */
function CharacterBudget({ count, limit, message, warningId }: { count: number; limit: number; message: string; warningId: string }) {
  const over = count > limit;
  return (
    <span className={cx("shrink-0 text-xs tabular-nums", over ? "font-medium text-warning-fg" : "text-fg-3")}>
      <span aria-hidden="true">
        {count}/{limit}
      </span>
      <span id={warningId} aria-live="polite" className={over ? "ml-2" : "sr-only"}>
        {over ? message : ""}
      </span>
    </span>
  );
}

const defaultSoftLimitMessage = "Long lines may wrap on phones";

type TextFieldProps = FieldProps &
  SoftLimitProps & {
    type?: "text" | "email" | "url" | "password" | "search";
    defaultValue?: string;
    autoComplete?: string;
    inputMode?: "text" | "email" | "numeric" | "decimal" | "tel" | "url" | "search";
    placeholder?: string;
    /** The hard limit, matching the server's rule. */
    maxLength?: number;
    readOnly?: boolean;
    /** For client forms whose other parts follow this value. */
    onValueChange?: (value: string) => void;
  };

/** A single line of text. */
export function TextField({
  type = "text",
  defaultValue,
  autoComplete,
  inputMode,
  placeholder,
  maxLength,
  readOnly,
  softLimit,
  softLimitMessage = defaultSoftLimitMessage,
  onValueChange,
  ...field
}: TextFieldProps) {
  const wiring = useFormField(field.name, field.errorKey);
  const input = useRef<HTMLInputElement>(null);
  const [count, setCount] = useCharacterCount(input, defaultValue);
  const warningId = `${wiring.id}-budget`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCount(event.currentTarget.value.length);
    onValueChange?.(event.currentTarget.value);
  };

  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <input
        {...controlProps(wiring, field.errorKey, field.hint, softLimit !== undefined && count > softLimit ? warningId : undefined)}
        name={field.name}
        ref={input}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        readOnly={readOnly}
        required={!field.optional}
        onChange={handleChange}
        className={cx(inputClasses(wiring.density), !field.hideLabel && "mt-1.5")}
      />
      <FieldMessage
        wiring={wiring}
        hint={field.hint}
        aside={softLimit !== undefined && <CharacterBudget count={count} limit={softLimit} message={softLimitMessage} warningId={warningId} />}
      />
    </div>
  );
}

type TextAreaProps = FieldProps &
  SoftLimitProps & {
    defaultValue?: string;
    rows?: number;
    maxLength?: number;
    placeholder?: string;
    onValueChange?: (value: string) => void;
  };

/** Text over several lines. It grows with its content where the browser can. */
export function TextArea({
  defaultValue,
  rows = 4,
  maxLength,
  placeholder,
  softLimit,
  softLimitMessage = defaultSoftLimitMessage,
  onValueChange,
  ...field
}: TextAreaProps) {
  const wiring = useFormField(field.name, field.errorKey);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [count, setCount] = useCharacterCount(textarea, defaultValue);
  const warningId = `${wiring.id}-budget`;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCount(event.currentTarget.value.length);
    onValueChange?.(event.currentTarget.value);
  };

  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <textarea
        {...controlProps(wiring, field.errorKey, field.hint, softLimit !== undefined && count > softLimit ? warningId : undefined)}
        name={field.name}
        ref={textarea}
        defaultValue={defaultValue}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={!field.optional}
        onChange={handleChange}
        className={cx(textareaClasses(), !field.hideLabel && "mt-1.5")}
      />
      <FieldMessage
        wiring={wiring}
        hint={field.hint}
        aside={softLimit !== undefined && <CharacterBudget count={count} limit={softLimit} message={softLimitMessage} warningId={warningId} />}
      />
    </div>
  );
}

type NumberFieldProps = FieldProps & {
  defaultValue?: number;
  placeholder?: string;
};

/** A whole number, with the numeric keypad on phones. */
export function NumberField({ defaultValue, placeholder, ...field }: NumberFieldProps) {
  return (
    <TextField
      {...field}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
    />
  );
}

type PhoneFieldProps = FieldProps & {
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
};

/**
 * A mobile number. Accepts "082 123 4567", "+27 82 123 4567" or any +country
 * number; when people leave it, a number it understands is rewritten the way
 * the site shows numbers ("+27 82 123 4567"). The server parses it again.
 */
export function PhoneField({ placeholder = "e.g. 082 123 4567", autoComplete = "tel", defaultValue, ...field }: PhoneFieldProps) {
  const wiring = useFormField(field.name, field.errorKey);
  const normalise = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = parsePhoneNumber(event.currentTarget.value);
    if (parsed.ok) event.currentTarget.value = formatPhoneNumber(parsed.e164);
  };
  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <input
        {...controlProps(wiring, field.errorKey, field.hint)}
        name={field.name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue === undefined ? undefined : formatPhoneNumber(defaultValue)}
        required={!field.optional}
        onBlur={normalise}
        className={cx(inputClasses(wiring.density), !field.hideLabel && "mt-1.5")}
      />
      <FieldMessage wiring={wiring} hint={field.hint} />
    </div>
  );
}

type RandsFieldProps = FieldProps & {
  /** Whole rands. */
  defaultValue?: number;
  placeholder?: string;
};

/** The digits of a price as typed, without the "R", spaces or thousands commas people may add or paste. */
function priceDigits(text: string): string {
  return text.trim().replace(/^R/i, "").replace(/[\s,]/g, "");
}

/**
 * A price in whole rands: bare digits while editing, "R4,400" otherwise, the
 * numeric keypad on phones. It posts the digits under `name` (from a hidden
 * input), so the server never has to read the formatting.
 */
export function RandsField({ defaultValue, placeholder, ...field }: RandsFieldProps) {
  const wiring = useFormField(field.name, field.errorKey);
  const initial = defaultValue === undefined ? "" : String(defaultValue);
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(false);
  const visible = useRef<HTMLInputElement>(null);
  const digits = priceDigits(text);

  useEffect(() => {
    const form = visible.current?.form;
    if (!form) return;
    const restore = () => {
      setText(initial);
      setEditing(false);
    };
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, [initial]);

  const shown = editing || !/^\d+$/.test(digits) ? text : formatRands(Number(digits));

  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <input
        {...controlProps(wiring, field.errorKey ?? field.name, field.hint)}
        ref={visible}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={shown}
        required={!field.optional}
        onFocus={() => {
          setEditing(true);
          setText(digits);
        }}
        onBlur={() => setEditing(false)}
        onChange={(event) => setText(event.currentTarget.value)}
        className={cx(inputClasses(wiring.density), "tabular-nums", !field.hideLabel && "mt-1.5")}
      />
      <input type="hidden" name={field.name} value={digits} />
      <FieldMessage wiring={wiring} hint={field.hint} />
    </div>
  );
}

type TimeFieldProps = FieldProps & {
  /** "06:00". */
  defaultValue?: string;
  min?: string;
  max?: string;
};

/** A time of day in 15-minute steps, with the device's own picker. */
export function TimeField({ defaultValue, min, max, ...field }: TimeFieldProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <input
        {...controlProps(wiring, field.errorKey, field.hint)}
        name={field.name}
        type="time"
        step={900}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required={!field.optional}
        className={cx(inputClasses(wiring.density), "tabular-nums", !field.hideLabel && "mt-1.5")}
      />
      <FieldMessage wiring={wiring} hint={field.hint} />
    </div>
  );
}

type DateFieldProps = FieldProps & {
  /** "2026-10-20". */
  defaultValue?: string;
  min?: string;
  max?: string;
  /** The date as it's changed ("" while it isn't a whole date). */
  onValueChange?: (value: string) => void;
};

/** A calendar date, with the device's own picker. */
export function DateField({ defaultValue, min, max, onValueChange, ...field }: DateFieldProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      <input
        {...controlProps(wiring, field.errorKey, field.hint)}
        name={field.name}
        type="date"
        min={min}
        max={max}
        defaultValue={defaultValue}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={!field.optional}
        className={cx(inputClasses(wiring.density), "tabular-nums", !field.hideLabel && "mt-1.5")}
      />
      <FieldMessage wiring={wiring} hint={field.hint} />
    </div>
  );
}

export type FieldOption = { value: string; label: string };

type SelectProps = FieldProps & {
  options: readonly FieldOption[];
  defaultValue?: string;
  /** A first, unselectable option asking for a choice, e.g. "Choose a session type". */
  placeholder?: string;
  /** Shown but not changeable (say why in the hint). The value is still sent. */
  locked?: boolean;
  onValueChange?: (value: string) => void;
};

/** One choice from a list, as a native select. */
export function Select({ options, defaultValue, placeholder, locked = false, onValueChange, ...field }: SelectProps) {
  const wiring = useFormField(field.name, field.errorKey);
  const select = useRef<HTMLSelectElement>(null);
  // React sets a select's default (what resetting its form goes back to) only when it first appears.
  // Keep it on the value given now, as React does for text fields: otherwise Discard after a save
  // brings back the value the page was opened with, and the next save stores it again.
  useEffect(() => {
    for (const option of select.current?.options ?? []) option.defaultSelected = option.value === (defaultValue ?? "");
  }, [defaultValue]);
  return (
    <div className={field.className}>
      <FieldLabel wiring={wiring} label={field.label} optional={field.optional} hideLabel={field.hideLabel} />
      {locked && <input type="hidden" name={field.name} value={defaultValue ?? ""} />}
      <select
        {...controlProps(wiring, field.errorKey, field.hint)}
        ref={select}
        name={locked ? undefined : field.name}
        disabled={locked}
        defaultValue={defaultValue ?? ""}
        required={!field.optional}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        className={cx(selectClasses(wiring.density), !field.hideLabel && "mt-1.5", locked && "cursor-not-allowed")}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessage wiring={wiring} hint={field.hint} />
    </div>
  );
}

type CheckboxProps = Omit<FieldProps, "optional" | "hideLabel"> & {
  defaultChecked?: boolean;
  /** Required ticks, such as consent, are checked by the form's rules; this marks it for assistive technology. */
  required?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** A checkbox with its label beside it; the whole row is the hit area. Posts "on" when ticked. */
export function Checkbox({ defaultChecked, required, onCheckedChange, ...field }: CheckboxProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <div className={field.className}>
      <label htmlFor={wiring.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
        <input
          {...controlProps(wiring, field.errorKey, field.hint)}
          // Said outright: browsers report an unticked required box as invalid before anyone has touched it.
          aria-invalid={wiring.error ? true : false}
          name={field.name}
          type="checkbox"
          defaultChecked={defaultChecked}
          required={required}
          onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
          className="check-box mt-px"
        />
        <span className={labelClasses}>{field.label}</span>
      </label>
      <FieldMessage wiring={wiring} hint={field.hint} spacing="pl-8" />
    </div>
  );
}

type SwitchProps = Omit<FieldProps, "optional"> & {
  defaultChecked?: boolean;
  /** The state words beside it: "On"/"Off" by default, or e.g. "Open"/"Closed". */
  onLabel?: string;
  offLabel?: string;
  onCheckedChange?: (checked: boolean) => void;
};

/**
 * An on/off setting (design-spec §11.1): a 44 × 24 track (44 px hit area),
 * navy when on and grey when off, with the state in words beside it. It is
 * a checkbox with role="switch", so it posts "on" when on.
 */
export function Switch({ defaultChecked, onLabel = "On", offLabel = "Off", onCheckedChange, ...field }: SwitchProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <div className={field.className}>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={wiring.id} className={cx(labelClasses, field.hideLabel && "sr-only")}>
          {field.label}
        </label>
        <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-3">
          <input
            {...controlProps(wiring, field.errorKey, field.hint)}
            name={field.name}
            type="checkbox"
            role="switch"
            defaultChecked={defaultChecked}
            onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-11 shrink-0 rounded-full border border-transparent bg-control transition-colors duration-150 peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus forced-colors:border-[CanvasText] peer-checked:[&>span]:translate-x-5"
          >
            <span className="absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow-1 transition-[translate] duration-150 forced-colors:bg-[CanvasText]" />
          </span>
          <span aria-hidden="true" className="w-12 text-sm font-medium text-fg-2 peer-checked:hidden">
            {offLabel}
          </span>
          <span aria-hidden="true" className="hidden w-12 text-sm font-medium text-fg peer-checked:inline">
            {onLabel}
          </span>
        </label>
      </div>
      <FieldMessage wiring={wiring} hint={field.hint} spacing="" />
    </div>
  );
}

export type ChoiceOption = { value: string; label: string; description?: string };

type ChoiceGroupProps = Omit<FieldProps, "hideLabel"> & {
  options: readonly ChoiceOption[];
  defaultValue?: string;
  /** Keeps the group's label for screen readers only. */
  hideLegend?: boolean;
  onValueChange?: (value: string) => void;
};

/** The group around a set of radios: a fieldset whose legend is the field's label. */
function ChoiceFieldset({
  wiring,
  field,
  children,
}: {
  wiring: FieldWiring;
  field: Omit<ChoiceGroupProps, "options" | "defaultValue" | "onValueChange">;
  children: ReactNode;
}) {
  return (
    <fieldset
      role="radiogroup"
      aria-invalid={wiring.error ? true : undefined}
      aria-required={field.optional ? undefined : true}
      aria-describedby={describedBy(wiring, field.hint)}
      className={cx("group/choices", field.className)}
    >
      <legend className={cx(labelClasses, field.hideLegend && "sr-only")}>
        {field.label}
        {field.optional && <span className="font-normal text-fg-3"> (optional)</span>}
      </legend>
      {children}
      <FieldMessage wiring={wiring} hint={field.hint} />
    </fieldset>
  );
}

type RadioCardsProps = ChoiceGroupProps & {
  /** Two columns suit four short options (the booking form's 2 × 2 tiles). */
  columns?: 1 | 2;
};

/**
 * One choice from a few, as tiles with a radio (design-spec §8): 48 px tall at
 * least, and the chosen one has a 2 px navy border, a pale fill and a filled
 * radio, so it never relies on colour alone.
 */
export function RadioCards({ options, defaultValue, columns = 2, onValueChange, ...field }: RadioCardsProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <ChoiceFieldset wiring={wiring} field={field}>
      <div className={cx("grid gap-2", field.hideLegend ? "" : "mt-2", columns === 2 && "grid-cols-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            className="relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-sm border border-control bg-field px-3 py-2.5 text-base leading-snug transition-colors duration-150 hover:border-control-hover has-checked:border-selected-border has-checked:bg-selected has-checked:shadow-[inset_0_0_0_1px_var(--color-selected-border)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus group-aria-invalid/choices:border-danger"
          >
            <input
              type="radio"
              id={`${wiring.id}-${option.value}`}
              name={field.name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              data-error-key={field.errorKey}
              onChange={(event) => event.currentTarget.checked && onValueChange?.(option.value)}
              className="radio-dot focus-visible:outline-none"
            />
            <span className="min-w-0">
              <span className="block">{option.label}</span>
              {option.description && <span className="block text-sm text-fg-3">{option.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </ChoiceFieldset>
  );
}

/**
 * A segmented control (design-spec §11.1): a few mutually exclusive options in
 * one bar, the chosen one raised in white. For switching a form's mode, such
 * as Session · Blocked time · Time off. Not for navigation: use Tabs.
 */
export function SegmentedControl({ options, defaultValue, onValueChange, ...field }: ChoiceGroupProps) {
  const wiring = useFormField(field.name, field.errorKey);
  return (
    <ChoiceFieldset wiring={wiring} field={field}>
      <div className={cx("inline-flex max-w-full gap-1 rounded-sm border border-hairline bg-surface-2 p-1", !field.hideLegend && "mt-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            className="relative inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center rounded-xs px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg has-checked:bg-field has-checked:text-fg has-checked:shadow-1 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus pointer-fine:min-h-9"
          >
            <input
              type="radio"
              id={`${wiring.id}-${option.value}`}
              name={field.name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              data-error-key={field.errorKey}
              onChange={(event) => event.currentTarget.checked && onValueChange?.(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </ChoiceFieldset>
  );
}

type FieldGroupProps = {
  title: string;
  description?: ReactNode;
  /** Two columns from 640 px, for short fields side by side. */
  columns?: 1 | 2;
  className?: string;
  children: ReactNode;
};

/** Related fields under a heading, with a sentence explaining them. */
export function FieldGroup({ title, description, columns = 1, className, children }: FieldGroupProps) {
  return (
    <section className={cx("border-t border-hairline pt-8 first:border-t-0 first:pt-0", className)}>
      <h2 className="text-h4 font-bold">{title}</h2>
      {description && <p className="mt-1 max-w-[60ch] text-sm text-fg-2">{description}</p>}
      <div className={cx("mt-5 grid gap-5", columns === 2 && "sm:grid-cols-2")}>{children}</div>
    </section>
  );
}
