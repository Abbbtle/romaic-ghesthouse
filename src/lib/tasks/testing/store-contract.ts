import type { InventoryStore } from "@/lib/inventory/ports";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import type { ReservationStore } from "@/lib/reservations/ports";
import { blockOf, testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import type { TaskStore } from "../ports";
import type { Task } from "../tasks";

/**
 * What every TaskStore must do, with the inventory and reservation stores
 * over the same data (tasks belong to units, cleans follow bookings), as
 * cases run on a fresh, empty set:
 *
 *   for (const { name, run } of taskStoreContract) it(name, async () => run(await emptyStores()));
 */
export type TaskStores = { tasks: TaskStore; inventory: InventoryStore; reservations: ReservationStore };

export type TaskStoreCase = { name: string; run: (stores: TaskStores) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const staffId = "00000000-0000-4000-8000-0000000000a4";
const unitA = "00000000-0000-4000-8000-00000000a0a1";
const unitB = "00000000-0000-4000-8000-00000000a0b2";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T10:00:00.000Z");
const task1 = "00000000-0000-4000-8000-0000000e0001";
const task2 = "00000000-0000-4000-8000-0000000e0002";
const task3 = "00000000-0000-4000-8000-0000000e0003";
const photo1 = "00000000-0000-4000-8000-0000000f0001";
const photo2 = "00000000-0000-4000-8000-0000000f0002";

export function testTask(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    kind: "maintenance",
    unitId: unitA,
    bookingId: null,
    title: "Fix the dripping tap",
    notes: null,
    status: "open",
    priority: "normal",
    assignedTo: null,
    dueOn: "2026-11-12",
    createdBy: ownerId,
    createdAt: at,
    startedAt: null,
    doneAt: null,
    doneBy: null,
    photoIds: [],
    ...fields,
  };
}

async function withUnits(inventory: InventoryStore) {
  await inventory.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
  await inventory.addUnit(testUnit(unitB, "Unit 2"), { maxUnits: 10 });
}

export const taskStoreContract: readonly TaskStoreCase[] = [
  {
    name: "stores a task and reads it back exactly, and refuses one for a missing unit",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      const task = testTask(task1, { notes: "Under the basin", priority: "urgent", assignedTo: staffId });
      expectSame(await tasks.create(task), { status: "created" }, "create");
      expectSame(await tasks.task(task1), task, "read back");
      expectSame(await tasks.create(testTask(task2, { unitId: "00000000-0000-4000-8000-00000000a0ff" })), { status: "unit-missing" }, "missing unit");
    },
  },
  {
    name: "keeps one clean per stay, however often it's made, and marks the unit at check-out",
    async run({ tasks, inventory, reservations }) {
      await withUnits(inventory);
      const guestId = "00000000-0000-4000-8000-00000000c001";
      const booking = testBooking("00000000-0000-4000-8000-00000000d001", guestId);
      await reservations.create({ newGuest: testGuest(guestId), booking, block: blockOf(booking, "00000000-0000-4000-8000-0000000b0001") });
      const clean = (id: string) => testTask(id, { kind: "housekeeping", title: "Clean Unit 1 after Thandi", bookingId: booking.id, createdBy: null });
      expectSame(await tasks.create(clean(task1)), { status: "created" }, "first");
      expectSame(await tasks.create(clean(task2)), { status: "duplicate" }, "second");
      const dirty = { unitId: unitA, status: "dirty" as const, note: null, updatedAt: later, updatedBy: null };
      expectSame(await tasks.checkOut(dirty, clean(task3)), { status: "duplicate" }, "at check-out");
      expectSame(await tasks.unitStatuses(), [dirty], "unit dirty all the same");
      expectSame((await tasks.tasks({ statuses: ["open"], limit: 10 })).map((task) => task.id), [task1], "one clean");
      expectSame(await tasks.create(testTask(task2, { kind: "maintenance", bookingId: booking.id })), { status: "created" }, "maintenance isn't a clean");
    },
  },
  {
    name: "lists open work by due day with urgent first, mine only when asked, and done work newest first",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      await tasks.create(testTask(task1, { dueOn: "2026-11-13" }));
      await tasks.create(testTask(task2, { dueOn: "2026-11-12", assignedTo: staffId }));
      await tasks.create(testTask(task3, { dueOn: "2026-11-13", priority: "urgent", unitId: unitB }));
      const ids = async (filter: Parameters<TaskStore["tasks"]>[0]) => (await tasks.tasks(filter)).map((task) => task.id);
      expectSame(await ids({ statuses: ["open", "in-progress"], limit: 10 }), [task2, task3, task1], "open");
      expectSame(await ids({ statuses: ["open", "in-progress"], assignedTo: staffId, limit: 10 }), [task2], "mine");
      await tasks.finish({ id: task1, at, by: staffId, note: null, unitStatus: null });
      await tasks.finish({ id: task3, at: later, by: staffId, note: null, unitStatus: null });
      expectSame(await ids({ statuses: ["done"], limit: 10 }), [task3, task1], "done");
      expectSame(await ids({ statuses: ["done"], doneSince: later, limit: 10 }), [task3], "done since");
    },
  },
  {
    name: "starts only an open task, taking it on when nobody has it",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      await tasks.create(testTask(task1));
      await tasks.create(testTask(task2, { assignedTo: ownerId }));
      expectSame(await tasks.start(task1, later, staffId), true, "start");
      expectSame([(await tasks.task(task1))?.status, (await tasks.task(task1))?.assignedTo, (await tasks.task(task1))?.startedAt], ["in-progress", staffId, later], "started");
      expectSame(await tasks.start(task1, later, staffId), false, "again");
      await tasks.start(task2, later, staffId);
      expectSame((await tasks.task(task2))?.assignedTo, ownerId, "keeps who had it");
    },
  },
  {
    name: "finishes a task once, with its note, setting the unit's status in the same step",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      await tasks.create(testTask(task1, { kind: "housekeeping", notes: "Extra towels" }));
      const finish = { id: task1, at: later, by: staffId, note: "All done", unitStatus: { unitId: unitA, status: "clean" as const, note: null, updatedAt: later, updatedBy: staffId } };
      expectSame(await tasks.finish(finish), true, "finish");
      const finished = await tasks.task(task1);
      expectSame([finished?.status, finished?.doneAt, finished?.doneBy, finished?.notes], ["done", later, staffId, "Extra towels\nAll done"], "finished");
      expectSame(await tasks.unitStatuses(), [finish.unitStatus], "unit clean");
      expectSame(await tasks.finish(finish), false, "again");
      expectSame(await tasks.addNote(task1, "Late note"), false, "no notes once done");
    },
  },
  {
    name: "adds notes and photos while a task isn't done, up to the most it keeps",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      await tasks.create(testTask(task1));
      expectSame(await tasks.addNote(task1, "Needs a new washer"), true, "note");
      expectSame(await tasks.addNote(task1, "Bought one"), true, "second note");
      expectSame((await tasks.task(task1))?.notes, "Needs a new washer\nBought one", "notes");
      expectSame(await tasks.addPhoto(task1, photo1, 1), true, "photo");
      expectSame(await tasks.addPhoto(task1, photo2, 1), false, "over the limit");
      expectSame((await tasks.task(task1))?.photoIds, [photo1], "photos");
    },
  },
  {
    name: "changes who has a task, removes it, and keeps unit statuses",
    async run({ tasks, inventory }) {
      await withUnits(inventory);
      await tasks.create(testTask(task1));
      expectSame(await tasks.change(task1, { priority: "urgent", dueOn: "2026-11-14", assignedTo: staffId }), true, "change");
      const changed = await tasks.task(task1);
      expectSame([changed?.priority, changed?.dueOn, changed?.assignedTo], ["urgent", "2026-11-14", staffId], "changed");
      expectSame(await tasks.remove(task1), true, "remove");
      expectSame(await tasks.task(task1), null, "gone");
      expectSame(await tasks.remove(task1), false, "already gone");
      const outOfOrder = { unitId: unitB, status: "out-of-order" as const, note: "Geyser burst", updatedAt: at, updatedBy: ownerId };
      expectSame(await tasks.setUnitStatus(outOfOrder), true, "set");
      expectSame(await tasks.setUnitStatus({ ...outOfOrder, status: "clean", note: null, updatedAt: later }), true, "set again");
      expectSame(await tasks.unitStatuses(), [{ ...outOfOrder, status: "clean", note: null, updatedAt: later }], "replaced");
      expectSame(await tasks.setUnitStatus({ ...outOfOrder, unitId: "00000000-0000-4000-8000-00000000a0ff" }), false, "missing unit");
    },
  },
];

/** JSON with object keys in order, so two stores may build records in different orders. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
