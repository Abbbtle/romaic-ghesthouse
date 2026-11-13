"use client";

import { useState } from "react";
import { DateField, SegmentedControl, TextArea, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { breachStatusNames, breachStatuses, type BreachStatus } from "@/lib/privacy/privacy";
import { breachSchema, privacyLimits } from "@/lib/privacy/privacy-input";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { SheetForm } from "../sheet-form";

const validate = formValidator(breachSchema);

export type EditableBreach = {
  id: string;
  discoveredOn: string;
  summary: string;
  dataInvolved: string;
  peopleAffected: string;
  status: BreachStatus;
  containedOn: string;
  regulatorToldOn: string;
  regulatorReference: string;
  peopleToldOn: string;
  peopleToldHow: string;
  actions: string;
  revision: number;
};

/** The breach's fields, shared by recording one and changing it. */
function BreachFields({ breach, today }: { breach: EditableBreach | null; today: string }) {
  const [status, setStatus] = useState<string>(breach?.status ?? "ongoing");
  return (
    <div className="grid gap-4">
      <DateField name="discoveredOn" label="Discovered on" defaultValue={breach?.discoveredOn ?? today} max={today} />
      <TextArea name="summary" label="What happened" rows={3} maxLength={privacyLimits.summaryMax} defaultValue={breach?.summary ?? ""} hint="Such as: the reception laptop was stolen from the car." />
      <TextArea
        name="dataInvolved"
        label="What personal information was involved"
        rows={2}
        maxLength={privacyLimits.dataInvolvedMax}
        defaultValue={breach?.dataInvolved ?? ""}
        hint="Such as: guests' names and phone numbers in a spreadsheet."
      />
      <TextField name="peopleAffected" label="How many people" optional inputMode="numeric" autoComplete="off" defaultValue={breach?.peopleAffected ?? ""} hint="Leave it empty if you don't know yet." />
      <SegmentedControl name="status" label="Is it contained?" options={breachStatuses.map((value) => ({ value, label: breachStatusNames[value] }))} defaultValue={status} onValueChange={setStatus} />
      {status === "contained" && <DateField name="containedOn" label="Contained on" defaultValue={breach?.containedOn || today} max={today} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="regulatorToldOn" label="Information Regulator told on" optional defaultValue={breach?.regulatorToldOn ?? ""} max={today} hint="Empty until you've told them." />
        <TextField name="regulatorReference" label="Regulator's reference" optional autoComplete="off" maxLength={privacyLimits.referenceMax} defaultValue={breach?.regulatorReference ?? ""} />
        <DateField name="peopleToldOn" label="People affected told on" optional defaultValue={breach?.peopleToldOn ?? ""} max={today} hint="Empty until you've told them." />
        <TextField name="peopleToldHow" label="How they were told" optional autoComplete="off" maxLength={privacyLimits.toldHowMax} defaultValue={breach?.peopleToldHow ?? ""} hint="Such as: an email to each guest." />
      </div>
      <TextArea name="actions" label="What's been done" optional rows={4} maxLength={privacyLimits.actionsMax} defaultValue={breach?.actions ?? ""} hint="Such as: passwords changed, the bank told, the laptop reported to the police." />
    </div>
  );
}

/** Records a breach in the register as soon as it's known: what's known now, filled in more later. */
export function NewBreachSheet({ action, today, primary }: { action: FormAction; today: string; primary: boolean }) {
  return (
    <SheetForm
      trigger="Record a breach"
      variant={primary ? "primary" : "secondary"}
      title="Record a breach"
      description="Personal information seen, taken or lost by someone who shouldn't have it. Record what you know now; you can add more later."
    >
      {(close) => (
        <ActionForm action={action} validate={validate} footer="button" submitLabel="Record breach" pendingLabel="Saving…" onSaved={close} resetOnSave>
          <BreachFields breach={null} today={today} />
        </ActionForm>
      )}
    </SheetForm>
  );
}

/** A breach's record, kept up to date as it's handled. */
export function ChangeBreachForm({ breach, today, action }: { breach: EditableBreach; today: string; action: FormAction }) {
  return (
    <ActionForm action={action} validate={validate} subject="this breach">
      <input type="hidden" name="breachId" value={breach.id} />
      <input type="hidden" name="revision" value={breach.revision} />
      <BreachFields breach={breach} today={today} />
    </ActionForm>
  );
}
