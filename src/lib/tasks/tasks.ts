import type { IsoDate } from "@/lib/format/zoned-time";

/**
 * The house's work: housekeeping (the clean after each stay, made by itself
 * when a guest checks out or on their leaving day) and maintenance (a
 * problem someone reported, or a job the owner or sales set). Each task is
 * for one unit. And each unit has a status the team keeps up to date:
 * clean, dirty, inspected or out of order.
 *
 * Tasks never carry money or a guest's contact details: the clean after a
 * stay names the unit and the guest's first name, nothing else, so staff
 * can see every task (roles.md, "Staff's limited view").
 */

export const taskKinds = ["housekeeping", "maintenance"] as const;

export type TaskKind = (typeof taskKinds)[number];

export const taskKindNames: Record<TaskKind, string> = {
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
};

export const taskStatuses = ["open", "in-progress", "done"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskStatusNames: Record<TaskStatus, string> = {
  open: "To do",
  "in-progress": "Started",
  done: "Done",
};

export const taskPriorities = ["normal", "urgent"] as const;

export type TaskPriority = (typeof taskPriorities)[number];

export const taskPriorityNames: Record<TaskPriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
};

export const unitStatuses = ["clean", "dirty", "inspected", "out-of-order"] as const;

export type UnitStatusValue = (typeof unitStatuses)[number];

export const unitStatusNames: Record<UnitStatusValue, string> = {
  clean: "Clean",
  dirty: "Needs cleaning",
  inspected: "Inspected",
  "out-of-order": "Out of order",
};

export type Task = {
  id: string;
  kind: TaskKind;
  unitId: string;
  /** The stay a clean follows; null for maintenance and for cleans set by hand. Never sent to the browser. */
  bookingId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** The account the task is with; null while nobody has it. */
  assignedTo: string | null;
  dueOn: IsoDate;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  doneAt: Date | null;
  doneBy: string | null;
  /** Private files (purpose "task-photo"), oldest first. */
  photoIds: string[];
};

/** A unit's housekeeping status. A unit nobody has set yet counts as clean. */
export type UnitStatus = {
  unitId: string;
  status: UnitStatusValue;
  note: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** The most photos one task keeps. */
export const maxTaskPhotos = 6;

/** "Thandi Mokoena" → "Thandi": all a clean's title says about the guest. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** The title of the clean after a stay. */
export function cleanTitle(unitName: string, guestName: string): string {
  const first = firstNameOf(guestName);
  return first ? `Clean ${unitName} after ${first}` : `Clean ${unitName}`;
}
