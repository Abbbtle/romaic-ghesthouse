"use client";

import { Eye } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DateField, RadioCards, TextArea, TextField } from "@/components/ui/fields";
import { failedState, type FormAction, type FormState } from "@/lib/forms/form-state";
import { requestKindHelp, requestKindNames, requestKinds, type RequestKind } from "@/lib/privacy/privacy";
import { answerSchema, changeRequestSchema, identitySchema, newRequestSchema, privacyLimits, refuseSchema } from "@/lib/privacy/privacy-input";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { callServerAction } from "../server-call";
import { SheetForm } from "../sheet-form";
import { useQuickAction, type QuickResult } from "../tasks/use-quick-action";

const kindOptions = requestKinds.map((kind) => ({ value: kind, label: requestKindNames[kind], description: requestKindHelp[kind] }));

const dueHint = "Section 23 of the Act says an access request is answered within a reasonable time, and section 24 a correction as soon as reasonably practicable. Choose the day you'll answer by, and check it with your Information Officer.";

const validateNew = formValidator(newRequestSchema);

/** Logs a request as it came in: who asked, how to reach them (kept encrypted), what they asked for, and when it's due. */
export function NewRequestSheet({ action, today }: { action: FormAction; today: string }) {
  return (
    <SheetForm trigger="Log a request" variant="primary" title="Log a request" description="Someone asking about their personal information: to see it, correct it, delete it, or object to how it's used.">
      {() => (
        <ActionForm action={action} validate={validateNew} footer="button" submitLabel="Log request" pendingLabel="Saving…">
          <div className="grid gap-4">
            <TextField name="requesterName" label="Who asked" autoComplete="off" maxLength={privacyLimits.nameMax} hint="Their name, as they gave it." />
            <TextField
              name="contact"
              label="How to reach them"
              optional
              autoComplete="off"
              maxLength={privacyLimits.contactMax}
              hint="An email address, phone number or postal address. Kept encrypted, and shown only partly unless you open it."
            />
            <RadioCards name="kind" label="What they're asking for" options={kindOptions} columns={1} />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField name="receivedOn" label="Received on" defaultValue={today} max={today} />
              <DateField name="dueOn" label="Answer by" hint={dueHint} />
            </div>
            <TextArea name="details" label="What they asked" optional rows={3} maxLength={privacyLimits.detailsMax} />
          </div>
        </ActionForm>
      )}
    </SheetForm>
  );
}

const validateChange = formValidator(changeRequestSchema);

export type EditableRequest = { id: string; kind: RequestKind; receivedOn: string; dueOn: string; details: string; notes: string; revision: number; open: boolean };

/** A request's details and notes. Once it's closed only the notes change. */
export function ChangeRequestForm({ request, action }: { request: EditableRequest; action: FormAction }) {
  return (
    <ActionForm action={action} validate={validateChange} subject="this request">
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="revision" value={request.revision} />
      <div className="grid gap-4">
        {request.open ? (
          <>
            <RadioCards name="kind" label="What they're asking for" options={kindOptions} columns={1} defaultValue={request.kind} />
            <DateField name="dueOn" label="Answer by" min={request.receivedOn} defaultValue={request.dueOn} hint={dueHint} />
            <TextArea name="details" label="What they asked" optional rows={3} maxLength={privacyLimits.detailsMax} defaultValue={request.details} />
          </>
        ) : (
          <>
            <input type="hidden" name="kind" value={request.kind} />
            <input type="hidden" name="dueOn" value={request.dueOn} />
            <input type="hidden" name="details" value={request.details} />
          </>
        )}
        <TextArea name="notes" label="Notes" optional rows={4} maxLength={privacyLimits.notesMax} defaultValue={request.notes} hint="What you've checked or sent, for your own record." />
      </div>
    </ActionForm>
  );
}

const validateAnswer = formValidator(answerSchema);
const validateRefuse = formValidator(refuseSchema);
const validateIdentity = formValidator(identitySchema);

type StartAction = (id: string, revision: number) => Promise<QuickResult>;

/** What happens next on an open request: start it (while it's only received), then mark it answered or refused, each with its day. */
export function RequestSteps({
  id,
  revision,
  status,
  today,
  actions,
}: {
  id: string;
  revision: number;
  status: "received" | "in-progress";
  today: string;
  actions: { start: StartAction; answer: FormAction; refuse: FormAction };
}) {
  const starting = useQuickAction();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {status === "received" && (
          <Button variant="primary" pending={starting.pending} pendingLabel="Saving…" onClick={() => starting.run(() => actions.start(id, revision), "Marked in progress")}>
            Start work on it
          </Button>
        )}
        <SheetForm
          trigger="Mark answered"
          variant={status === "received" ? "secondary" : "primary"}
          title="Mark answered"
          description="You've given them what they asked for, or told them what you did."
        >
          {(close) => (
            <ActionForm action={actions.answer} validate={validateAnswer} footer="button" submitLabel="Mark answered" pendingLabel="Saving…" onSaved={close}>
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="revision" value={revision} />
              <div className="grid gap-4">
                <DateField name="closedOn" label="Answered on" defaultValue={today} max={today} />
                <TextArea name="outcome" label="What you did" optional rows={3} maxLength={privacyLimits.outcomeMax} hint="Such as: sent the export of her guest record by email." />
              </div>
            </ActionForm>
          )}
        </SheetForm>
        <SheetForm trigger="Refuse" variant="secondary" title="Refuse the request" description="Record why, and the day you told them.">
          {(close) => (
            <ActionForm action={actions.refuse} validate={validateRefuse} footer="button" submitLabel="Mark refused" pendingLabel="Saving…" onSaved={close}>
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="revision" value={revision} />
              <div className="grid gap-4">
                <DateField name="closedOn" label="Told them on" defaultValue={today} max={today} />
                <TextArea name="outcome" label="Why it's refused" rows={3} maxLength={privacyLimits.outcomeMax} hint="Check the reason with your Information Officer before you tell them." />
              </div>
            </ActionForm>
          )}
        </SheetForm>
      </div>
      {starting.problem && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {starting.problem}
        </p>
      )}
    </div>
  );
}

/** Notes how the owner checked who made the request, before anything about them is released. */
export function IdentityForm({ id, revision, action }: { id: string; revision: number; action: FormAction }) {
  return (
    <ActionForm action={action} validate={validateIdentity} footer="button" submitLabel="Save" submitVariant="secondary" pendingLabel="Saving…">
      <input type="hidden" name="requestId" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <TextField name="how" label="How you checked" autoComplete="off" maxLength={privacyLimits.identityNoteMax} hint="Such as: she wrote from the email on her booking and confirmed her stay dates." />
    </ActionForm>
  );
}

type RevealAction = (id: string) => Promise<FormState | { status: "signed-out" } | { status: "step-up" }>;

/** The requester's contact, masked until the owner opens it (each look is in the activity log). */
export function RevealContact({ id, hint, action }: { id: string; hint: string; action: RevealAction }) {
  const [contact, setContact] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await callServerAction(() => action(id), () => failedState("That didn't go through. Check your connection and try again."));
      if (result.status === "saved") setContact(result.message);
      else if (result.status === "failed") setProblem(result.message);
      else if (result.status === "invalid") setProblem(Object.values(result.errors)[0] ?? "That didn't work. Reload the page and try again.");
      else if (result.status === "step-up") setProblem("For your security, reload the page and confirm your password and code, then try again.");
      else if (result.status === "signed-out") setProblem("You've been signed out. Sign in again in another tab, then try again.");
    });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 font-medium break-all text-ink">{contact ?? hint}</span>
        {contact === null && (
          <Button variant="ghost" size="sm" icon={<Eye aria-hidden="true" />} pending={pending} pendingLabel="Opening…" onClick={open}>
            Show in full
          </Button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {problem}
        </p>
      )}
    </div>
  );
}
