import { formatDayShort } from "@/lib/format/date-time";
import { addDays, type IsoDate } from "@/lib/format/zoned-time";
import type { TaskView, UnitStatusView } from "@/lib/tasks/task-service";
import { taskKindNames, taskStatusNames, type TaskStatus, type UnitStatusValue } from "@/lib/tasks/tasks";
import type { StatusTone } from "../status-pill";
import { capitalised, whenLabel } from "../when-label";

/** A task as its card shows it, worked out on the server (which knows the time) so the browser shows the same words. */
export type TaskCardData = Omit<TaskView, "doneAt" | "unitId"> & {
  kindName: string;
  statusName: string;
  /** "Due today", "Overdue since Tue 10 Nov", "Done today at 14:05". */
  whenText: string;
  /** "With you", "With Lerato", "Not given to anyone yet". */
  whoText: string;
};

export const taskStatusTones: Record<TaskStatus, StatusTone> = { open: "neutral", "in-progress": "info", done: "success" };

/** When a task is due, as the person reads it on `today`. */
export function dueLabel(dueOn: IsoDate, today: IsoDate): string {
  if (dueOn < today) return `Overdue since ${formatDayShort(dueOn)}`;
  if (dueOn === today) return "Due today";
  if (dueOn === addDays(today, 1)) return "Due tomorrow";
  return `Due ${formatDayShort(dueOn)}`;
}

export function taskCardOf(task: TaskView & { doneAt: Date | null }, today: IsoDate, now: Date, timeZone: string): TaskCardData {
  return {
    id: task.id,
    kind: task.kind,
    unitName: task.unitName,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo,
    assigneeName: task.assigneeName,
    dueOn: task.dueOn,
    overdue: task.overdue,
    mine: task.mine,
    photoIds: task.photoIds,
    kindName: taskKindNames[task.kind],
    statusName: taskStatusNames[task.status],
    whenText: task.status === "done" && task.doneAt ? `Done ${whenLabel(task.doneAt, now, timeZone)}` : dueLabel(task.dueOn, today),
    whoText: task.assigneeName ? (task.mine ? "With you" : `With ${task.assigneeName}`) : "Not given to anyone yet",
  };
}

/** A unit's housekeeping status as the list shows it. */
export type UnitStatusRow = {
  unitId: string;
  unitName: string;
  status: UnitStatusValue;
  note: string | null;
  /** "Today at 14:05", or null when nobody has set it yet (it counts as clean). */
  changed: string | null;
};

export function unitStatusRowOf(unit: UnitStatusView, now: Date, timeZone: string): UnitStatusRow {
  return {
    unitId: unit.unitId,
    unitName: unit.unitName,
    status: unit.status,
    note: unit.note,
    changed: unit.updatedAt ? capitalised(whenLabel(unit.updatedAt, now, timeZone)) : null,
  };
}
