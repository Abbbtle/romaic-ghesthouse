"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { taskFieldLimits, unitStatusSchema } from "@/lib/tasks/task-input";
import { unitStatuses, unitStatusNames, type UnitStatusValue } from "@/lib/tasks/tasks";
import { ActionForm } from "../action-form";
import { formValidator } from "../form-validator";
import { StatusPill, type StatusTone } from "../status-pill";
import type { UnitStatusRow } from "./task-labels";

export const unitStatusTones: Record<UnitStatusValue, StatusTone> = { clean: "success", dirty: "warning", inspected: "info", "out-of-order": "danger" };

const validate = formValidator(unitStatusSchema);
const statusOptions = unitStatuses.map((status) => ({ value: status, label: unitStatusNames[status] }));

function UnitRow({ unit, action }: { unit: UnitStatusRow; action: FormAction | null }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-fg">{unit.unitName}</p>
          {(unit.note || unit.changed) && <p className="text-sm text-fg-2">{[unit.note, unit.changed].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={unitStatusTones[unit.status]}>{unitStatusNames[unit.status]}</StatusPill>
          {action && (
            <Button size="sm" variant="ghost" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
              Change<span className="sr-only"> {unit.unitName}</span>
            </Button>
          )}
        </div>
      </div>
      {action && editing && (
        <ActionForm action={action} validate={validate} footer="button" submitLabel="Save status" subject={unit.unitName} onSaved={() => setEditing(false)} className="mt-3 grid gap-4">
          <input type="hidden" name="unitId" value={unit.unitId} />
          <Select name="status" label="Status" defaultValue={unit.status} options={statusOptions} />
          <TextField name="note" label="Note" optional defaultValue={unit.note ?? ""} maxLength={taskFieldLimits.unitNoteMax} hint="e.g. Waiting for the plumber" />
        </ActionForm>
      )}
    </li>
  );
}

/** Each apartment's housekeeping status, worst first, which anyone with rooms:status can change. */
export function UnitStatuses({ units, action }: { units: readonly UnitStatusRow[]; action: FormAction | null }) {
  return (
    <ul aria-label="Apartment statuses" className="divide-y divide-hairline">
      {units.map((unit) => (
        <UnitRow key={unit.unitId} unit={unit} action={action} />
      ))}
    </ul>
  );
}
