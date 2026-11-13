"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateField, Select, TextField } from "@/components/ui/fields";
import { useFormField } from "@/components/ui/form";
import { errorClasses, hintClasses, labelClasses } from "@/components/ui/form-controls";
import { cx } from "@/components/ui/cx";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { privateFileMaxBytes } from "@/lib/media/private-files";
import { fileReturnSchema } from "@/lib/tax/tax-input";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { useToast } from "../toast";

/** What can be prepared, worded on the server. */
export type PrepareOption = { kind: string; name: string; available: boolean; reason: string | null; periods: { month: string; label: string }[]; payments: boolean };

/**
 * Prepares a return from the books: which return, and which period. Only
 * the returns the registrations switch on can be chosen; the others say why
 * not. Preparing opens the draft.
 */
export function PrepareReturnForm({ options, action }: { options: readonly PrepareOption[]; action: FormAction }) {
  const available = options.filter((option) => option.available && option.periods.length > 0);
  const [kind, setKind] = useState(available[0]?.kind ?? "");
  const chosen = available.find((option) => option.kind === kind);
  if (available.length === 0) return null;
  return (
    <ActionForm action={action} footer="button" submitLabel="Prepare return" pendingLabel="Preparing…">
      <div className="grid gap-4 sm:grid-cols-3">
        <Select name="kind" label="Return" options={available.map((option) => ({ value: option.kind, label: option.name }))} defaultValue={kind} onValueChange={setKind} />
        {chosen && <Select key={chosen.kind} name="month" label="Period" options={chosen.periods.map((period) => ({ value: period.month, label: period.label }))} defaultValue={chosen.periods[0]?.month} />}
        {chosen?.payments && (
          <Select
            name="payment"
            label="Payment"
            options={[
              { value: "first", label: "First payment" },
              { value: "second", label: "Second payment" },
            ]}
            defaultValue="first"
          />
        )}
      </div>
    </ActionForm>
  );
}

type IdAction = (id: string) => Promise<ConfirmedActionResult>;

/** Where a return goes next, by its status: review a draft (or refresh or discard it), set a reviewed one back to draft. */
export function ReturnSteps({
  id,
  status,
  actions,
  backHref,
}: {
  id: string;
  status: "draft" | "reviewed" | "filed";
  actions: { review: IdAction; reopen: IdAction; refresh: IdAction; discard: IdAction };
  backHref: string;
}) {
  const toasts = useToast();
  const router = useRouter();
  const shown = (message: string) => () => toasts?.show({ message });
  if (status === "filed") return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "draft" ? (
        <>
          <ConfirmButton
            variant="primary"
            tone="primary"
            title="Mark this return reviewed?"
            description="Its figures are then fixed. Check them with your accountant first. You can set it back to draft to refresh them."
            confirmLabel="Mark reviewed"
            pendingLabel="Saving…"
            action={() => actions.review(id)}
            onDone={shown("Marked reviewed")}
          >
            Mark reviewed
          </ConfirmButton>
          <ConfirmButton
            variant="secondary"
            tone="primary"
            title="Refresh the figures from the books?"
            description="They're worked out again from the books as they are now."
            confirmLabel="Refresh figures"
            pendingLabel="Refreshing…"
            action={() => actions.refresh(id)}
            onDone={shown("Figures refreshed")}
          >
            Refresh figures
          </ConfirmButton>
          <ConfirmButton
            title="Discard this draft?"
            description="It's removed. Nothing in the books changes, and you can prepare it again."
            confirmLabel="Discard draft"
            pendingLabel="Discarding…"
            action={() => actions.discard(id)}
            onDone={() => router.push(backHref)}
          >
            Discard draft
          </ConfirmButton>
        </>
      ) : (
        <ConfirmButton
          variant="secondary"
          tone="primary"
          title="Set this return back to draft?"
          description="Its figures can then be refreshed. Mark it reviewed again before recording it as filed."
          confirmLabel="Back to draft"
          pendingLabel="Saving…"
          action={() => actions.reopen(id)}
          onDone={shown("Back to draft")}
        >
          Back to draft
        </ConfirmButton>
      )}
    </div>
  );
}

/** The proof of submission: a PDF or photo of eFiling's confirmation. */
function ProofField() {
  const wiring = useFormField("proof");
  return (
    <div>
      <label htmlFor={wiring.id} className={cx("block", labelClasses)}>
        Proof of submission
      </label>
      <input
        id={wiring.id}
        name="proof"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        required
        aria-invalid={wiring.error ? true : undefined}
        aria-describedby={wiring.error ? wiring.errorId : wiring.hintId}
        data-error-key="proof"
        className="mt-1.5 block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-sm file:border file:border-control file:bg-white file:px-3 file:font-medium file:text-fg"
      />
      {wiring.error ? (
        <p id={wiring.errorId} className={cx("mt-1.5", errorClasses)}>
          {wiring.error}
        </p>
      ) : (
        <p id={wiring.hintId} className={cx("mt-1.5", hintClasses)}>
          The confirmation from eFiling, as a PDF or a photo, up to 3.5 MB. Kept privately; only the owner can open it.
        </p>
      )}
    </div>
  );
}

function fileProblems(today: string) {
  return (data: FormData): FieldErrors => {
    const parsed = parseWith(fileReturnSchema, Object.fromEntries(data));
    const errors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
    if (!errors.filedOn && String(data.get("filedOn") ?? "") > today) errors.filedOn = "Choose today or an earlier day.";
    const proof = data.get("proof");
    if (!(proof instanceof File) || proof.size === 0) errors.proof = "Choose the proof of submission from eFiling.";
    else if (proof.size > privateFileMaxBytes) errors.proof = "That file is larger than 3.5 MB. Choose a smaller one.";
    return errors;
  };
}

/** Records that a reviewed return was filed on eFiling: the day, SARS's reference, and the proof. Filing locks its months in the books. */
export function FileReturnForm({ id, today, locksMonths, action }: { id: string; today: string; locksMonths: boolean; action: FormAction }) {
  return (
    <ActionForm action={action} validate={fileProblems(today)} footer="button" submitLabel="Record as filed" pendingLabel="Saving…">
      <input type="hidden" name="returnId" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="filedOn" label="Filed on" defaultValue={today} max={today} />
        <TextField name="submissionReference" label="SARS reference" optional maxLength={40} hint="From the eFiling confirmation, if there is one." />
        <div className="sm:col-span-2">
          <ProofField />
        </div>
      </div>
      {locksMonths && <p className="mt-4 text-sm text-fg-2">Recording it as filed locks its months in the books, so nothing more is posted in them.</p>}
    </ActionForm>
  );
}
