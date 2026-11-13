import type { Actor } from "@/lib/kernel/actor";
import type { Task, TaskPriority, TaskStatus, UnitStatus } from "./tasks";

/**
 * What the tasks core needs from storage. Every write is one atomic command
 * and guards its own rules at write time (two people may tap Start at once).
 * Refusals come back as values.
 */

export type TaskCreation = { status: "created" } | { status: "duplicate" } | { status: "unit-missing" };

export type TaskFilter = {
  /** Only these statuses. */
  statuses?: readonly TaskStatus[];
  /** Only tasks with this account. */
  assignedTo?: string;
  /** Done tasks: only those finished at or after this instant. */
  doneSince?: Date;
  limit: number;
};

export type TaskFinish = {
  id: string;
  at: Date;
  by: string;
  /** Added to the task's notes, on its own line. */
  note: string | null;
  /** Set in the same transaction: the unit is clean after a housekeeping task. */
  unitStatus: UnitStatus | null;
};

export interface TaskStore {
  /** Tasks matching `filter`: open and started ones by due day (urgent first), done ones newest first. */
  tasks(filter: TaskFilter): Promise<Task[]>;
  task(id: string): Promise<Task | null>;
  /** Stores a task; a second clean for the same stay is a "duplicate", and nothing changes. */
  create(task: Task): Promise<TaskCreation>;
  /**
   * After a check-out, in one go: the unit's status (dirty) and its clean
   * (unless the stay already has one, which is left as it is).
   */
  checkOut(unitStatus: UnitStatus, clean: Task): Promise<TaskCreation>;
  /** Moves an open task to started, giving it to `assignTo` when nobody has it. False when it isn't open. */
  start(id: string, at: Date, assignTo: string): Promise<boolean>;
  /** Finishes an open or started task. False when it's already done or gone. */
  finish(finish: TaskFinish): Promise<boolean>;
  /** Adds a line to a task's notes, while it isn't done. */
  addNote(id: string, note: string): Promise<boolean>;
  /** Adds a photo while the task keeps fewer than `max`. */
  addPhoto(id: string, fileId: string, max: number): Promise<boolean>;
  /** Changes who a task is with, its urgency and due day, while it isn't done. */
  change(id: string, fields: { priority: TaskPriority; dueOn: string; assignedTo: string | null }): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  unitStatuses(): Promise<UnitStatus[]>;
  setUnitStatus(status: UnitStatus): Promise<boolean>;
}

/** Permissions the tasks core checks, from the accounts core (wired in src/server). */
export type TaskPermission = "tasks:work" | "tasks:manage" | "rooms:status" | "today:view";

export interface TaskAccess {
  can(actor: Actor, permission: TaskPermission): boolean;
  assertCan(actor: Actor, permission: TaskPermission): void;
}
