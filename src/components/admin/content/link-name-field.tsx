"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormField } from "@/components/ui/form";
import { ContentText } from "./content-fields";
import { freeSlug } from "./choices";
import { useFormReset } from "./use-form-reset";

type LinkNameFieldProps = {
  /** The record's path: its link name posts as `${path}.id`. */
  path: string;
  /** The link name as saved, or "" for a record added since. */
  saved: string;
  /** For a record added since the last save: its name as typed, which the link name follows until someone types their own. */
  follow?: { name: string; taken: readonly string[]; fallback: string };
  hint: ReactNode;
};

/**
 * A record's link name, such as a pricing group's "one-to-one" in
 * /pricing#one-to-one, under "Advanced": links to the old one stop working
 * when it changes. A new record's follows its name ("Thandi K" → "thandi-k")
 * until someone types their own. It opens by itself when it has a problem.
 */
export function LinkNameField({ path, saved, follow, hint }: LinkNameFieldProps) {
  const name = `${path}.id`;
  const { error } = useFormField(name);
  const box = useRef<HTMLDetailsElement>(null);
  const typed = useRef(false);
  const suggestion = follow ? freeSlug(follow.name, follow.taken, follow.fallback) : null;

  useFormReset(box, () => {
    typed.current = false;
  });

  // The field isn't React's to fill (it keeps what's typed), so the suggestion is written into it.
  useEffect(() => {
    const input = box.current?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);
    if (input && suggestion !== null && !typed.current) input.value = suggestion;
  }, [name, suggestion]);

  return (
    <details ref={box} open={error ? true : undefined} className="group rounded-sm border border-hairline bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-fg-2 marker:text-fg-3 hover:text-fg">Advanced</summary>
      <div className="border-t border-hairline p-3">
        <ContentText
          name={name}
          label="Link name"
          limit="slug"
          defaultValue={suggestion ?? saved}
          hint={hint}
          onValueChange={() => {
            typed.current = true;
          }}
        />
      </div>
    </details>
  );
}
