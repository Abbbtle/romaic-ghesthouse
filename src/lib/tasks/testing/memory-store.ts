import type { MemoryInventoryState } from "@/lib/inventory/testing/memory-store";
import type { TaskCreation, TaskStore } from "../ports";
import type { Task, UnitStatus } from "../tasks";

/**
 * Tasks and unit statuses in memory, for tests, with the Postgres store's
 * rules (./store-contract.ts checks both). It reads units from the
 * inventory's state, so a task for a missing unit is refused as in Postgres.
 */
export function createMemoryTaskStore(inventory: Pick<MemoryInventoryState, "units">): TaskStore {
  const tasks = new Map<string, Task>();
  const statuses = new Map<string, UnitStatus>();
  const copy = <T>(value: T): T => structuredClone(value);

  function create(task: Task): TaskCreation {
    if (!inventory.units.has(task.unitId)) return { status: "unit-missing" };
    if (task.kind === "housekeeping" && task.bookingId && [...tasks.values()].some((other) => other.kind === "housekeeping" && other.bookingId === task.bookingId)) {
      return { status: "duplicate" };
    }
    tasks.set(task.id, copy(task));
    return { status: "created" };
  }

  const urgency = (task: Task) => (task.priority === "urgent" ? 0 : 1);

  return {
    async tasks(filter) {
      const list = [...tasks.values()].filter(
        (task) =>
          (!filter.statuses || filter.statuses.includes(task.status)) &&
          (!filter.assignedTo || task.assignedTo === filter.assignedTo) &&
          (!filter.doneSince || (task.doneAt !== null && task.doneAt >= filter.doneSince)),
      );
      const done = filter.statuses?.length === 1 && filter.statuses[0] === "done";
      list.sort(done ? (a, b) => b.doneAt!.getTime() - a.doneAt!.getTime() : (a, b) => a.dueOn.localeCompare(b.dueOn) || urgency(a) - urgency(b) || a.createdAt.getTime() - b.createdAt.getTime());
      return list.slice(0, filter.limit).map(copy);
    },
    async task(id) {
      const task = tasks.get(id);
      return task ? copy(task) : null;
    },
    async create(task) {
      return create(task);
    },
    async checkOut(unitStatus, clean) {
      if (!inventory.units.has(unitStatus.unitId)) return { status: "unit-missing" };
      statuses.set(unitStatus.unitId, copy(unitStatus));
      return create(clean);
    },
    async start(id, at, assignTo) {
      const task = tasks.get(id);
      if (!task || task.status !== "open") return false;
      tasks.set(id, { ...task, status: "in-progress", startedAt: at, assignedTo: task.assignedTo ?? assignTo });
      return true;
    },
    async finish({ id, at, by, note, unitStatus }) {
      const task = tasks.get(id);
      if (!task || task.status === "done") return false;
      tasks.set(id, { ...task, status: "done", doneAt: at, doneBy: by, notes: note ? [task.notes, note].filter(Boolean).join("\n") : task.notes });
      if (unitStatus) statuses.set(unitStatus.unitId, copy(unitStatus));
      return true;
    },
    async addNote(id, note) {
      const task = tasks.get(id);
      if (!task || task.status === "done") return false;
      tasks.set(id, { ...task, notes: [task.notes, note].filter(Boolean).join("\n") });
      return true;
    },
    async addPhoto(id, fileId, max) {
      const task = tasks.get(id);
      if (!task || task.status === "done" || task.photoIds.length >= max || task.photoIds.includes(fileId)) return false;
      tasks.set(id, { ...task, photoIds: [...task.photoIds, fileId] });
      return true;
    },
    async change(id, fields) {
      const task = tasks.get(id);
      if (!task || task.status === "done") return false;
      tasks.set(id, { ...task, ...fields });
      return true;
    },
    async remove(id) {
      return tasks.delete(id);
    },
    async unitStatuses() {
      return [...statuses.values()].map(copy);
    },
    async setUnitStatus(status) {
      if (!inventory.units.has(status.unitId)) return false;
      statuses.set(status.unitId, copy(status));
      return true;
    },
  };
}
