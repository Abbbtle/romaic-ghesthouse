"use client";

import { useRef, useState, type ReactNode } from "react";
import { Switch, TextArea, TextField } from "@/components/ui/fields";
import { designBudgets, textLimits, type TextLimitName } from "@/lib/content/limits";
import { useFormReset } from "./use-form-reset";

/*
 * The fields the content editors are made of. Each is named by its dotted
 * path in the section ("hero.lead"), so the section's own schema checks it
 * and its problems land on it (see ./form-values.ts).
 */

/** Past this share of its limit, a field shows how many characters it has left room for. */
const counterFrom = 0.8;

type ContentTextProps = {
  /** The field's path in the section: "hero.lead". */
  name: string;
  label: string;
  /**
   * Which of the content core's limits applies: it's the field's maxLength.
   * A limit with a design budget (hero lines, plan names…) also shows the
   * budget's counter, which warns that long lines may wrap on phones.
   */
  limit: TextLimitName;
  /** A tighter or looser maximum than the named limit, where a schema sets its own (a room's summary). */
  max?: number;
  defaultValue: string;
  optional?: boolean;
  hint?: ReactNode;
  /** Several lines (paragraphs, quotes); otherwise one. */
  multiline?: boolean;
  rows?: number;
  /** For rows that repeat a visible heading: the label is kept for screen readers. */
  hideLabel?: boolean;
  type?: "text" | "email";
  inputMode?: "text" | "email" | "url";
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  onValueChange?: (value: string) => void;
};

/**
 * Text with the content core's limit. The counter shows from the start for
 * text with a design budget, and otherwise once the text nears its limit, so
 * a long form isn't covered in numbers.
 */
export function ContentText({
  name,
  label,
  limit,
  max: maxOverride,
  defaultValue,
  optional,
  hint,
  multiline = false,
  rows,
  hideLabel,
  type,
  inputMode,
  autoComplete = "off",
  placeholder,
  className,
  onValueChange,
}: ContentTextProps) {
  const max = maxOverride ?? textLimits[limit];
  const budget: number | undefined = (designBudgets as Partial<Record<TextLimitName, number>>)[limit];
  const [length, setLength] = useState(defaultValue.length);
  const box = useRef<HTMLDivElement>(null);
  useFormReset(box, () => setLength(defaultValue.length));

  const softLimit = budget ?? (length >= max * counterFrom ? max : undefined);
  const change = (value: string) => {
    setLength(value.length);
    onValueChange?.(value);
  };
  const shared = { name, label, defaultValue, optional, hint, hideLabel, placeholder, maxLength: max, softLimit, onValueChange: change };

  return (
    <div ref={box} className={className}>
      {multiline ? (
        <TextArea {...shared} rows={rows} />
      ) : (
        <TextField {...shared} type={type} inputMode={inputMode} autoComplete={autoComplete} />
      )}
    </div>
  );
}

type OptionalFieldsProps = {
  /** The path of the value that may be left out (null): "hero.secondary". The switch posts under it. */
  name: string;
  /** The switch: "Show a second button". */
  label: string;
  hint?: ReactNode;
  defaultOn: boolean;
  /** The value's fields, drawn only while it's on; while it's off nothing is posted, which saves it as none. */
  children: ReactNode;
};

/** Something a page can do without, such as a second button: a switch, and its fields while it's on. */
export function OptionalFields({ name, label, hint, defaultOn, children }: OptionalFieldsProps) {
  const [on, setOn] = useState(defaultOn);
  const box = useRef<HTMLDivElement>(null);
  useFormReset(box, () => setOn(defaultOn));

  return (
    <div ref={box} className="grid gap-4">
      <Switch name={name} label={label} hint={hint} defaultChecked={defaultOn} onLabel="Shown" offLabel="Hidden" onCheckedChange={setOn} />
      {on && <div className="grid gap-5 border-l-2 border-neutral-200 pl-4">{children}</div>}
    </div>
  );
}
