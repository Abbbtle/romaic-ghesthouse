"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { DateField, Select, TextArea, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import type { Assignee } from "@/lib/tasks/task-service";
import { newTaskSchema, problemReportSchema, taskFieldLimits } from "@/lib/tasks/task-input";
import { taskKindNames, taskKinds, taskPriorities, taskPriorityNames } from "@/lib/tasks/tasks";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { SheetForm } from "../sheet-form";

export type UnitChoice = { id: string; name: string };

const validateTask = formValidator(newTaskSchema);
const validateProblem = formValidator(problemReportSchema);

const unitOptions = (units: readonly UnitChoice[]) => units.map((unit) => ({ value: unit.id, label: unit.name }));
const priorityOptions = taskPriorities.map((priority) => ({ value: priority, label: taskPriorityNames[priority] }));

/** "Report a problem", for anyone who works tasks: it becomes a maintenance task due today, for the owner or sales to give out. */
export function ReportProblem({ action, units }: { action: FormAction; units: readonly UnitChoice[] }) {
  return (
    <SheetForm
      trigger="Report a problem"
      icon={<TriangleAlert aria-hidden="true" />}
      variant="secondary"
      title="Report a problem"
      description="Something broken or running low in an apartment. It goes on the open list for today."
    >
      {(close) => (
        <ActionForm action={action} validate={validateProblem} footer="button" submitLabel="Report problem" pendingLabel="Reporting…" resetOnSave onSaved={close} className="grid gap-5">
          <Select name="unitId" label="Apartment" placeholder="Choose the apartment" options={unitOptions(units)} />
          <TextField name="title" label="What's wrong" placeholder="e.g. Shower drain is slow" maxLength={taskFieldLimits.titleMax} />
          <TextArea name="notes" label="Details" optional rows={3} maxLength={taskFieldLimits.notesMax} hint="Where exactly, and anything you've already tried." />
          <Select name="priority" label="How urgent" defaultValue="normal" options={priorityOptions} hint="Urgent if a guest can't use something they need." />
        </ActionForm>
      )}
    </SheetForm>
  );
}

/** "New task", for the owner and sales: any housekeeping or maintenance job, given to someone or left open. */
export function NewTask({ action, units, people, today }: { action: FormAction; units: readonly UnitChoice[]; people: readonly Assignee[]; today: string }) {
  return (
    <SheetForm trigger="New task" icon={<Plus aria-hidden="true" />} variant="primary" title="New task" description="A job for one apartment. Give it to someone now, or leave it on the open list.">
      {(close) => (
        <ActionForm action={action} validate={validateTask} footer="button" submitLabel="Add task" pendingLabel="Adding…" resetOnSave onSaved={close} className="grid gap-5">
          <Select name="kind" label="Kind" defaultValue="maintenance" options={taskKinds.map((kind) => ({ value: kind, label: taskKindNames[kind] }))} />
          <Select name="unitId" label="Apartment" placeholder="Choose the apartment" options={unitOptions(units)} />
          <TextField name="title" label="What needs doing" placeholder="e.g. Replace the kitchen light bulb" maxLength={taskFieldLimits.titleMax} />
          <TextArea name="notes" label="Details" optional rows={3} maxLength={taskFieldLimits.notesMax} />
          <DateField name="dueOn" label="Due" defaultValue={today} min={today} />
          <Select name="priority" label="How urgent" defaultValue="normal" options={priorityOptions} />
          <Select name="assignedTo" label="Who it's for" optional defaultValue="" options={[{ value: "", label: "No one yet" }, ...people.map((person) => ({ value: person.id, label: person.name }))]} />
        </ActionForm>
      )}
    </SheetForm>
  );
}
