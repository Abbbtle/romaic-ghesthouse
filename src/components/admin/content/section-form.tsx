"use client";

import { useCallback, type ReactNode } from "react";
import { failedState, type FormAction, type FormState } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";
import { parseSection, sectionNames, sectionSchemas, type SectionKey } from "@/lib/content/schema";
import { ActionForm } from "../action-form";
import { contentPageHref } from "./content-sections";
import { formValues } from "./form-values";

/**
 * The server action that saves a section: its key, the revision the editor
 * started from, and the section as the form holds it. It answers like a
 * form, or that the session has gone or must confirm the person again.
 */
export type SaveSection = (section: SectionKey, revision: number, content: unknown) => Promise<FormState | { status: "signed-out" } | { status: "step-up" }>;

const signedOutMessage = "You've been signed out. Sign in again in another tab, then save again: your changes are still here.";

const stepUpMessage = "Confirm it's you first: enter your password and code again in another tab, then save again. Your changes are still here.";

type SectionFormProps = {
  section: SectionKey;
  /** The revision the form shows. A save over a newer one is refused, so nobody overwrites someone else's changes unseen. */
  revision: number;
  save: SaveSection;
  /** The section's parts. */
  children: ReactNode;
};

/**
 * A section's editor form: its fields are checked
 * with the section's own schema as people leave them and when they save, so
 * problems show beside the field that has them before anything is sent, and
 * the server checks again. Saving publishes; the toast offers the page it
 * changed. Once saved, the page refreshes with the new revision and the
 * fields start again from what was stored, tidied as the server tidied it.
 */
export function SectionForm({ section, revision, save, children }: SectionFormProps) {
  const schema = sectionSchemas[section];

  const validate = useCallback(
    (fields: FormData): FieldErrors => {
      const parsed = parseSection(section, formValues(schema, fields));
      return parsed.ok ? {} : parsed.errors;
    },
    [section, schema],
  );

  const action = useCallback<FormAction>(
    async (_previous, fields) => {
      const result = await save(section, revision, formValues(schema, fields));
      if (result.status === "signed-out") return failedState(signedOutMessage);
      if (result.status === "step-up") return failedState(stepUpMessage);
      return result;
    },
    [save, section, revision, schema],
  );

  return (
    <ActionForm
      action={action}
      validate={validate}
      subject={sectionNames[section]}
      savedAction={contentPageHref(section) ? { label: "View on site", href: contentPageHref(section)! } : undefined}
      className="min-w-0"
    >
      {/* A new revision redraws the fields from what was saved. */}
      <div key={revision} className="grid gap-8 rounded-md border border-hairline bg-white p-5 lg:p-7">
        {children}
      </div>
    </ActionForm>
  );
}
