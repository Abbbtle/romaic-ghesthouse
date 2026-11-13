"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField, Select, TextArea } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import type { Assignee } from "@/lib/tasks/task-service";
import { taskChangeSchema, taskFieldLimits, taskNoteSchema } from "@/lib/tasks/task-input";
import { taskPriorities, taskPriorityNames } from "@/lib/tasks/tasks";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { acceptedImageTypes, prepareImage } from "../content/prepare-image";
import { formValidator } from "../form-validator";
import { StatusPill } from "../status-pill";
import { useToast } from "../toast";
import { taskStatusTones, type TaskCardData } from "./task-labels";
import { useQuickAction, type QuickResult } from "./use-quick-action";

/** The tasks actions a card calls. Change and remove are only for those who manage tasks. */
export type TaskCardActions = {
  start: (id: string) => Promise<QuickResult>;
  finish: FormAction;
  addNote: FormAction;
  addPhoto: (data: FormData) => Promise<QuickResult>;
  change?: FormAction;
  remove?: (id: string) => Promise<ConfirmedActionResult>;
};

const validateNote = formValidator(taskNoteSchema);
const validateChange = formValidator(taskChangeSchema);

const priorityOptions = taskPriorities.map((priority) => ({ value: priority, label: taskPriorityNames[priority] }));

type Mode = "finish" | "note" | "change" | null;

/**
 * One task: what, where, when and who, its notes and photos, and what can
 * happen next. Start takes it on; Mark done asks for an optional note; a
 * photo can be added from the phone's camera or gallery at any point until
 * it's done. The owner and sales can also change it or remove it.
 */
export function TaskCard({
  task,
  actions,
  people,
  photoMaxBytes,
  compact = false,
}: {
  task: TaskCardData;
  actions: TaskCardActions;
  /** Who it can be given to, for those who manage tasks. */
  people?: readonly Assignee[];
  photoMaxBytes: number;
  /** Only the next step and Add photo (Today). */
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const starting = useQuickAction();
  const uploading = useQuickAction();
  const problem = starting.problem ?? uploading.problem;
  const toasts = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const open = task.status !== "done";
  const toggle = (next: Exclude<Mode, null>) => setMode((current) => (current === next ? null : next));

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    const prepared = await prepareImage(file, photoMaxBytes);
    if (picker.current) picker.current.value = "";
    if (!prepared.ok) {
      uploading.setProblem(prepared.problem);
      return;
    }
    const data = new FormData();
    data.set("taskId", task.id);
    data.set("photo", prepared.image.file);
    uploading.run(() => actions.addPhoto(data), "Photo added");
  }

  return (
    <li className="px-4 py-4 lg:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-bold text-ink">{task.title}</p>
          <p className="mt-0.5 text-sm text-fg-2">
            {task.unitName} · {task.kindName}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {task.priority === "urgent" && open && <StatusPill tone="danger">Urgent</StatusPill>}
          <StatusPill tone={taskStatusTones[task.status]}>{task.statusName}</StatusPill>
        </div>
      </div>

      <p className="mt-2 text-sm text-fg-2">
        <span className={task.overdue ? "font-medium text-danger-700" : undefined}>{task.whenText}</span> · {task.whoText}
      </p>

      {task.notes && <p className="mt-2 max-w-[65ch] text-sm whitespace-pre-line text-fg">{task.notes}</p>}

      {task.photoIds.length > 0 && (
        <ul aria-label="Photos" className="mt-3 flex flex-wrap gap-2">
          {task.photoIds.map((id, index) => (
            <li key={id}>
              <a href={`/admin/files/${id}`} target="_blank" rel="noreferrer" className="block rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2">
                {/* A private file behind the session: the image optimiser can't fetch it, so it's a plain img. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/admin/files/${id}`} alt={`Photo ${index + 1} of ${task.title}`} loading="lazy" className="size-16 rounded-xs border border-hairline object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* One next step leads: Start while it's to do, Mark done once it's started. */}
          {task.status === "open" && (
            <Button size="sm" variant="primary" pending={starting.pending} pendingLabel="Starting…" onClick={() => starting.run(() => actions.start(task.id), "Started. It's on your list.")}>
              Start
            </Button>
          )}
          {(task.status === "in-progress" || !compact) && (
            <Button size="sm" variant={task.status === "in-progress" ? "primary" : "secondary"} aria-expanded={mode === "finish"} onClick={() => toggle("finish")}>
              Mark done
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<Camera aria-hidden="true" />} pending={uploading.pending} pendingLabel="Adding photo…" onClick={() => picker.current?.click()}>
            Add photo
          </Button>
          <input ref={picker} type="file" accept={acceptedImageTypes} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void addPhoto(event.currentTarget.files?.[0])} />
          {!compact && (
            <Button size="sm" variant="ghost" aria-expanded={mode === "note"} onClick={() => toggle("note")}>
              Add note
            </Button>
          )}
          {!compact && ((actions.change && people) || actions.remove) && (
            <Button size="sm" variant="ghost" aria-expanded={mode === "change"} onClick={() => toggle("change")}>
              Change
            </Button>
          )}
        </div>
      )}

      {problem && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
          {problem}
        </p>
      )}

      {open && mode === "finish" && (
        <ActionForm action={actions.finish} validate={validateNote} footer="button" submitLabel="Mark done" pendingLabel="Saving…" subject={task.title} onSaved={() => setMode(null)} className="mt-4 max-w-xl">
          <input type="hidden" name="taskId" value={task.id} />
          <TextArea
            name="note"
            label="Note"
            optional
            rows={3}
            maxLength={taskFieldLimits.noteMax}
            hint={task.kind === "housekeeping" ? "Anything the next person should know. The room is marked clean." : "What you did, or anything still to sort out."}
          />
        </ActionForm>
      )}

      {open && mode === "note" && (
        <ActionForm action={actions.addNote} validate={validateNote} footer="button" submitLabel="Add note" resetOnSave subject={task.title} onSaved={() => setMode(null)} className="mt-4 max-w-xl">
          <input type="hidden" name="taskId" value={task.id} />
          <TextArea name="note" label="Note" rows={3} maxLength={taskFieldLimits.noteMax} />
        </ActionForm>
      )}

      {open && mode === "change" && (
        <div className="mt-4 grid max-w-xl gap-4">
          {actions.change && people && (
            <ActionForm action={actions.change} validate={validateChange} footer="button" submitLabel="Save task" subject={task.title} onSaved={() => setMode(null)} className="grid gap-4">
              <input type="hidden" name="taskId" value={task.id} />
              <Select name="assignedTo" label="Who it's for" optional defaultValue={task.assignedTo ?? ""} options={[{ value: "", label: "No one yet" }, ...people.map((person) => ({ value: person.id, label: person.name }))]} />
              <DateField name="dueOn" label="Due" defaultValue={task.dueOn} />
              <Select name="priority" label="How urgent" defaultValue={task.priority} options={priorityOptions} />
            </ActionForm>
          )}
          {actions.remove && (
            <div className="border-t border-hairline pt-3">
              <ConfirmButton
                size="sm"
                title={`Remove “${task.title}”?`}
                description="It goes for everyone, with its notes. This can't be undone."
                confirmLabel="Remove task"
                pendingLabel="Removing…"
                action={() => actions.remove!(task.id)}
                onDone={() => toasts?.show({ message: "Task removed" })}
              >
                Remove task
              </ConfirmButton>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
