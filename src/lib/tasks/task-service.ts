import { parseWith } from "@/lib/forms/parse";
import { addDays, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Unit } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { TaskAccess, TaskStore } from "./ports";
import { newTaskSchema, problemReportSchema, taskChangeSchema, taskNoteSchema, unitStatusSchema } from "./task-input";
import { cleanTitle, maxTaskPhotos, type Task, type TaskKind, type TaskPriority, type TaskStatus, type UnitStatus, type UnitStatusValue } from "./tasks";

/** Someone a task can be given to: an active team member whose role works tasks. */
export type Assignee = { id: string; name: string };

/** A stay leaving on a day, as the clean after it needs it: the unit and the guest's name (only the first name is kept). */
export type Departure = { bookingId: string; unitId: string; guestName: string };

export type TaskServiceDependencies = {
  store: TaskStore;
  /** The guesthouse's units (src/lib/inventory). */
  units: () => Promise<Unit[]>;
  /** Who tasks can be given to (src/server reads the team). */
  people: () => Promise<Assignee[]>;
  /** Stays leaving on `day`, confirmed or checked in (src/lib/reservations). */
  departures: (day: IsoDate) => Promise<Departure[]>;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: TaskAccess;
  timeZone: string;
};

/**
 * A task as the browser gets it: names instead of ids where people read
 * them, and never the stay it follows. The same for every role, since a
 * task carries nothing staff mayn't see.
 */
export type TaskView = {
  id: string;
  kind: TaskKind;
  unitId: string;
  unitName: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: string | null;
  assigneeName: string | null;
  dueOn: IsoDate;
  overdue: boolean;
  /** With the person looking. */
  mine: boolean;
  photoIds: string[];
  doneAt: Date | null;
};

export type UnitStatusView = UnitStatus & { unitName: string };

export const taskViews = ["mine", "open", "done"] as const;

export type TaskBoardView = (typeof taskViews)[number];

/** How far back the Done list goes. */
export const doneListDays = 14;

/** The longest list one view shows. */
const listLimit = 200;

const taskGone = "This task was finished, changed or removed. Reload the page.";

export function createTaskService(deps: TaskServiceDependencies) {
  const { store, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function lookups() {
    const [units, people] = await Promise.all([deps.units(), deps.people()]);
    return { units: new Map(units.map((unit) => [unit.id, unit])), people: new Map(people.map((person) => [person.id, person.name])), unitList: units, peopleList: people };
  }

  function viewOf(task: Task, actor: Actor | null, names: { units: Map<string, Unit>; people: Map<string, string> }, on: IsoDate): TaskView {
    return {
      id: task.id,
      kind: task.kind,
      unitId: task.unitId,
      unitName: names.units.get(task.unitId)?.name ?? "An apartment",
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo,
      assigneeName: task.assignedTo ? (names.people.get(task.assignedTo) ?? "Someone no longer on the team") : null,
      dueOn: task.dueOn,
      overdue: task.status !== "done" && task.dueOn < on,
      mine: actor !== null && task.assignedTo === actor.id,
      photoIds: task.photoIds,
      doneAt: task.doneAt,
    };
  }

  async function record(actor: Actor | null, action: string, task: Pick<Task, "id" | "title">, summary: string) {
    await audit.record({ actor, category: "tasks", action, target: { type: "task", id: task.id }, summary });
  }

  async function knownUnit(unitId: string): Promise<Unit | null> {
    const unit = (await deps.units()).find((candidate) => candidate.id === unitId);
    return unit && unit.active ? unit : null;
  }

  async function knownAssignee(assignedTo: string | null): Promise<boolean> {
    return assignedTo === null || (await deps.people()).some((person) => person.id === assignedTo);
  }

  function newTask(fields: Pick<Task, "kind" | "unitId" | "title" | "notes" | "priority" | "dueOn" | "assignedTo" | "bookingId">, by: string | null): Task {
    return { id: ids.newId(), ...fields, status: "open", createdBy: by, createdAt: clock.now(), startedAt: null, doneAt: null, doneBy: null, photoIds: [] };
  }

  /** Units by status, worst first, for the board and Today. */
  async function statuses(): Promise<UnitStatusView[]> {
    const [units, stored] = await Promise.all([deps.units(), store.unitStatuses()]);
    const byUnit = new Map(stored.map((status) => [status.unitId, status]));
    const order: Record<UnitStatusValue, number> = { "out-of-order": 0, dirty: 1, inspected: 2, clean: 3 };
    return units
      .filter((unit) => unit.active)
      .map((unit) => ({ unitId: unit.id, status: "clean" as const, note: null, updatedAt: null, updatedBy: null, ...byUnit.get(unit.id), unitName: unit.name }))
      .sort((a, b) => order[a.status] - order[b.status] || a.unitName.localeCompare(b.unitName));
  }

  return {
    today,

    /** A view of the task list: the person's own, every open one, or the last two weeks' done ones. */
    async board(actor: Actor, view: TaskBoardView) {
      access.assertCan(actor, "tasks:work");
      const on = today();
      const names = await lookups();
      const tasks =
        view === "done"
          ? await store.tasks({ statuses: ["done"], doneSince: new Date(clock.now().getTime() - doneListDays * 86_400_000), limit: listLimit })
          : await store.tasks({ statuses: ["open", "in-progress"], assignedTo: view === "mine" ? actor.id : undefined, limit: listLimit });
      return {
        view,
        today: on,
        tasks: tasks.map((task) => viewOf(task, actor, names, on)),
        units: names.unitList.filter((unit) => unit.active).map((unit) => ({ id: unit.id, name: unit.name })),
        people: names.peopleList,
        canManage: access.can(actor, "tasks:manage"),
      };
    },

    /** For Today: open and started cleans due by today, and units that need cleaning or are out of order. */
    async toClean(actor: Actor): Promise<{ tasks: TaskView[]; units: UnitStatusView[] }> {
      access.assertCan(actor, "today:view");
      const on = today();
      const [names, open, units] = await Promise.all([lookups(), store.tasks({ statuses: ["open", "in-progress"], limit: listLimit }), statuses()]);
      return {
        tasks: open.filter((task) => task.kind === "housekeeping" && task.dueOn <= on).map((task) => viewOf(task, actor, names, on)),
        units: units.filter((unit) => unit.status === "dirty" || unit.status === "out-of-order"),
      };
    },

    /** A task the owner or sales sets. */
    async create(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "tasks:manage");
      const parsed = parseWith(newTaskSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const unit = await knownUnit(parsed.value.unitId);
      if (!unit) return refused({ unitId: "Choose an apartment from the list." });
      if (!(await knownAssignee(parsed.value.assignedTo))) return refused({ assignedTo: "Choose someone from the list." });
      if (parsed.value.dueOn < addDays(today(), -30)) return refused({ dueOn: "Choose a day no more than a month ago." });
      const task = newTask({ ...parsed.value, bookingId: null }, actor.id);
      const outcome = await store.create(task);
      if (outcome.status === "unit-missing") return refused({ unitId: "Choose an apartment from the list." });
      await record(actor, "task.created", task, `Added "${task.title}" for ${unit.name}`);
      return done({ id: task.id });
    },

    /** A problem reported by anyone who works tasks: a maintenance task for today, with nobody yet. */
    async reportProblem(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "tasks:work");
      const parsed = parseWith(problemReportSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const unit = await knownUnit(parsed.value.unitId);
      if (!unit) return refused({ unitId: "Choose an apartment from the list." });
      const task = newTask({ kind: "maintenance", ...parsed.value, dueOn: today(), assignedTo: null, bookingId: null }, actor.id);
      const outcome = await store.create(task);
      if (outcome.status === "unit-missing") return refused({ unitId: "Choose an apartment from the list." });
      await record(actor, "task.reported", task, `Reported "${task.title}" in ${unit.name}`);
      return done({ id: task.id });
    },

    /** Starts an open task, taking it on if nobody has it. */
    async start(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:work");
      const task = await store.task(id);
      if (!task || !(await store.start(id, clock.now(), actor.id))) return refusedWith(taskGone);
      await record(actor, "task.started", task, `Started "${task.title}"`);
      return done();
    },

    /** Finishes a task, with an optional note. A finished clean marks its unit clean. */
    async finish(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:work");
      const parsed = parseWith(taskNoteSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const task = await store.task(id);
      if (!task || task.status === "done") return refusedWith(taskGone);
      const now = clock.now();
      const unitStatus: UnitStatus | null = task.kind === "housekeeping" ? { unitId: task.unitId, status: "clean", note: null, updatedAt: now, updatedBy: actor.id } : null;
      if (!(await store.finish({ id, at: now, by: actor.id, note: parsed.value.note, unitStatus }))) return refusedWith(taskGone);
      await record(actor, "task.finished", task, `Finished "${task.title}"`);
      return done();
    },

    async addNote(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:work");
      const parsed = parseWith(taskNoteSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      if (!parsed.value.note) return refused({ note: "Write the note first." });
      const task = await store.task(id);
      if (!task || !(await store.addNote(id, parsed.value.note))) return refusedWith(taskGone);
      await record(actor, "task.noted", task, `Added a note to "${task.title}"`);
      return done();
    },

    /**
     * Whether a task can take another photo, asked before the photo is
     * uploaded so a refused one doesn't leave a stored file nothing points
     * to. addPhoto checks again, in case the task changed in between.
     */
    async checkPhotoRoom(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:work");
      const task = await store.task(id);
      if (!task || task.status === "done") return refusedWith(taskGone);
      if (task.photoIds.length >= maxTaskPhotos) return refusedWith(`A task keeps at most ${maxTaskPhotos} photos.`);
      return done();
    },

    /** Adds a stored photo (a private file, purpose "task-photo") to a task that isn't done. */
    async addPhoto(actor: Actor, id: string, fileId: string): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:work");
      const task = await store.task(id);
      if (!task || task.status === "done") return refusedWith(taskGone);
      if (task.photoIds.length >= maxTaskPhotos) return refusedWith(`A task keeps at most ${maxTaskPhotos} photos.`);
      if (!(await store.addPhoto(id, fileId, maxTaskPhotos))) return refusedWith(taskGone);
      await record(actor, "task.photo-added", task, `Added a photo to "${task.title}"`);
      return done();
    },

    /** Gives a task to someone (or nobody), and sets its urgency and due day. */
    async change(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:manage");
      const parsed = parseWith(taskChangeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      if (!(await knownAssignee(parsed.value.assignedTo))) return refused({ assignedTo: "Choose someone from the list." });
      const task = await store.task(id);
      if (!task || !(await store.change(id, parsed.value))) return refusedWith(taskGone);
      await record(actor, "task.changed", task, `Changed "${task.title}"`);
      return done();
    },

    async remove(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "tasks:manage");
      const task = await store.task(id);
      if (!task || !(await store.remove(id))) return refusedWith(taskGone);
      await record(actor, "task.removed", task, `Removed "${task.title}"`);
      return done();
    },

    /** Every active unit's status, worst first. */
    async unitStatuses(actor: Actor): Promise<UnitStatusView[]> {
      access.assertCan(actor, "rooms:status");
      return statuses();
    },

    async setUnitStatus(actor: Actor, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "rooms:status");
      const parsed = parseWith(unitStatusSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const unit = await knownUnit(parsed.value.unitId);
      if (!unit) return refused({ unitId: "Choose an apartment from the list." });
      if (!(await store.setUnitStatus({ ...parsed.value, updatedAt: clock.now(), updatedBy: actor.id }))) return refused({ unitId: "Choose an apartment from the list." });
      await audit.record({ actor, category: "tasks", action: "unit.status-set", target: { type: "unit", id: unit.id }, summary: `Marked ${unit.name} ${parsed.value.status}` });
      return done();
    },

    /**
     * After a guest checks out (no one's acting: the reservations core calls
     * it): their unit needs cleaning, and its clean is added, due today,
     * unless the stay already has one.
     */
    async afterCheckOut(departure: Departure): Promise<void> {
      const unit = (await deps.units()).find((candidate) => candidate.id === departure.unitId);
      if (!unit) return;
      const now = clock.now();
      const clean = newTask(
        { kind: "housekeeping", unitId: unit.id, bookingId: departure.bookingId, title: cleanTitle(unit.name, departure.guestName), notes: null, priority: "normal", dueOn: today(), assignedTo: null },
        null,
      );
      const outcome = await store.checkOut({ unitId: unit.id, status: "dirty", note: null, updatedAt: now, updatedBy: null }, clean);
      if (outcome.status === "created") await record(null, "task.created", clean, `Added "${clean.title}" after a check-out`);
    },

    /** The daily job: the clean for every stay leaving today, made once however often it runs. */
    async generateHousekeeping(): Promise<{ created: number }> {
      const on = today();
      const [departures, units] = await Promise.all([deps.departures(on), deps.units()]);
      const names = new Map(units.map((unit) => [unit.id, unit.name]));
      let created = 0;
      for (const departure of departures) {
        const unitName = names.get(departure.unitId);
        if (!unitName) continue;
        const clean = newTask(
          { kind: "housekeeping", unitId: departure.unitId, bookingId: departure.bookingId, title: cleanTitle(unitName, departure.guestName), notes: null, priority: "normal", dueOn: on, assignedTo: null },
          null,
        );
        if ((await store.create(clean)).status === "created") {
          created += 1;
          await record(null, "task.created", clean, `Added "${clean.title}" for today's departure`);
        }
      }
      return { created };
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
