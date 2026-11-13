import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import type { TaskAccess, TaskPermission } from "./ports";
import { createTaskService, type Departure } from "./task-service";
import { cleanTitle, firstNameOf } from "./tasks";
import { createMemoryTaskStore } from "./testing/memory-store";

class NotAllowed extends Error {}

/** Task permissions per role, as roles.md grants them; src/server's test checks the real matrix too. */
const grants: Record<Role, readonly TaskPermission[]> = {
  owner: ["tasks:work", "tasks:manage", "rooms:status", "today:view"],
  admin: [],
  sales: ["tasks:work", "tasks:manage", "rooms:status", "today:view"],
  staff: ["tasks:work", "rooms:status", "today:view"],
};

const access: TaskAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new NotAllowed(permission);
  },
};

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${{ owner: "a1", admin: "a2", sales: "a3", staff: "a4" }[role]}`, role, name: `Test ${role}` });
const owner = actor("owner");
const staff = actor("staff");
const admin = actor("admin");

async function harness() {
  let now = new Date("2026-11-12T08:00:00Z");
  const clock: Clock = { now: () => new Date(now) };
  const inventoryState = memoryInventoryState();
  const inventory = createMemoryInventoryStore(inventoryState);
  await inventory.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
  await inventory.addUnit(testUnit("u2", "Unit 2"), { maxUnits: 10 });
  const store = createMemoryTaskStore(inventoryState);
  const audit = memoryAuditRecorder();
  let departures: Departure[] = [];
  let next = 0;
  const service = createTaskService({
    store,
    units: () => inventory.units(),
    people: async () => [
      { id: owner.id, name: "Nico" },
      { id: staff.id, name: "Lerato" },
    ],
    departures: async () => departures,
    clock,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit,
    access,
    timeZone: "Africa/Johannesburg",
  });
  return {
    service,
    store,
    audit,
    setDepartures(list: Departure[]) {
      departures = list;
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("cleans", () => {
  it("name the unit and only the guest's first name", () => {
    assert.equal(firstNameOf("  Thandi  Mokoena "), "Thandi");
    assert.equal(cleanTitle("Unit 2", "Thandi Mokoena"), "Clean Unit 2 after Thandi");
    assert.equal(cleanTitle("Unit 2", ""), "Clean Unit 2");
  });

  it("are added at check-out, marking the unit dirty, and once a day for departures, never twice", async () => {
    const { service, setDepartures } = await harness();
    await service.afterCheckOut({ bookingId: "b1", unitId: "u1", guestName: "Thandi Mokoena" });
    setDepartures([
      { bookingId: "b1", unitId: "u1", guestName: "Thandi Mokoena" },
      { bookingId: "b2", unitId: "u2", guestName: "Pieter van Wyk" },
    ]);
    assert.deepEqual(await service.generateHousekeeping(), { created: 1 });
    assert.deepEqual(await service.generateHousekeeping(), { created: 0 });
    const today = await service.toClean(staff);
    assert.deepEqual(today.tasks.map((task) => task.title).sort(), ["Clean Unit 1 after Thandi", "Clean Unit 2 after Pieter"]);
    assert.deepEqual(today.units.map((unit) => [unit.unitName, unit.status]), [["Unit 1", "dirty"]]);
  });

  it("mark the unit clean when finished", async () => {
    const { service } = await harness();
    await service.afterCheckOut({ bookingId: "b1", unitId: "u1", guestName: "Thandi" });
    const [clean] = (await service.board(staff, "open")).tasks;
    assert.deepEqual(await service.start(staff, clean!.id), { ok: true });
    assert.equal((await service.board(staff, "mine")).tasks[0]?.title, "Clean Unit 1 after Thandi", "starting takes it on");
    assert.deepEqual(await service.finish(staff, clean!.id, { note: "Changed the linen" }), { ok: true });
    assert.deepEqual((await service.toClean(staff)).units, []);
    const [done] = (await service.board(staff, "done")).tasks;
    assert.equal(done?.notes, "Changed the linen");
    assert.equal((await service.finish(staff, clean!.id, {})).ok, false, "only once");
  });
});

describe("tasks", () => {
  it("let anyone who works tasks report a problem, and the owner or sales set and give out work", async () => {
    const { service, audit } = await harness();
    const reported = await service.reportProblem(staff, { unitId: "u2", title: "Geyser leaking", notes: "Water on the floor", priority: "urgent" });
    assert.equal(reported.ok, true);
    const set = await service.create(owner, { kind: "maintenance", unitId: "u1", title: "Replace the bulb", notes: "", priority: "normal", dueOn: "2026-11-13", assignedTo: staff.id });
    assert.equal(set.ok, true);
    const mine = (await service.board(staff, "mine")).tasks;
    assert.deepEqual(mine.map((task) => [task.title, task.assigneeName, task.mine]), [["Replace the bulb", "Lerato", true]]);
    const open = (await service.board(staff, "open")).tasks;
    assert.deepEqual(open.map((task) => task.title), ["Geyser leaking", "Replace the bulb"], "today's urgent problem first");
    assert.deepEqual(await service.change(owner, open[0]!.id, { priority: "urgent", dueOn: "2026-11-12", assignedTo: "someone-else" }), {
      ok: false,
      errors: { assignedTo: "Choose someone from the list." },
    });
    assert.deepEqual(await service.remove(owner, open[1]!.id), { ok: true });
    assert.deepEqual(
      audit.events.map((event) => [event.category, event.action]),
      [
        ["tasks", "task.reported"],
        ["tasks", "task.created"],
        ["tasks", "task.removed"],
      ],
    );
  });

  it("check the unit, the title and the photo limit", async () => {
    const { service } = await harness();
    assert.deepEqual(await service.reportProblem(staff, { unitId: "nowhere", title: "X", notes: "", priority: "normal" }), {
      ok: false,
      errors: { unitId: "Choose a room from the list." },
    });
    assert.equal((await service.reportProblem(staff, { unitId: "u1", title: " ", notes: "", priority: "normal" })).ok, false);
    const created = await service.reportProblem(staff, { unitId: "u1", title: "Broken window", notes: "", priority: "normal" });
    const id = created.ok ? created.id : "";
    for (let photo = 1; photo <= 6; photo += 1) assert.equal((await service.addPhoto(staff, id, `f${photo}`)).ok, true);
    assert.deepEqual(await service.addPhoto(staff, id, "f7"), { ok: false, errors: { form: "A task keeps at most 6 photos." } });
    assert.deepEqual(await service.checkPhotoRoom(staff, id), { ok: false, errors: { form: "A task keeps at most 6 photos." } }, "refused before the upload");
  });

  it("let staff work tasks and set unit statuses, but not set or give out work", async () => {
    const { service } = await harness();
    await assert.rejects(service.create(staff, {}), NotAllowed);
    await assert.rejects(service.change(staff, "t", {}), NotAllowed);
    await assert.rejects(service.remove(staff, "t"), NotAllowed);
    assert.deepEqual(await service.setUnitStatus(staff, { unitId: "u2", status: "out-of-order", note: "Geyser burst" }), { ok: true });
    assert.deepEqual((await service.unitStatuses(staff)).map((unit) => [unit.unitName, unit.status]), [
      ["Unit 2", "out-of-order"],
      ["Unit 1", "clean"],
    ]);
  });

  it("refuse admin (Weberu) everything", async () => {
    const { service } = await harness();
    await assert.rejects(service.board(admin, "open"), NotAllowed);
    await assert.rejects(service.toClean(admin), NotAllowed);
    await assert.rejects(service.reportProblem(admin, {}), NotAllowed);
    await assert.rejects(service.start(admin, "t"), NotAllowed);
    await assert.rejects(service.finish(admin, "t", {}), NotAllowed);
    await assert.rejects(service.addNote(admin, "t", {}), NotAllowed);
    await assert.rejects(service.addPhoto(admin, "t", "f"), NotAllowed);
    await assert.rejects(service.checkPhotoRoom(admin, "t"), NotAllowed);
    await assert.rejects(service.unitStatuses(admin), NotAllowed);
    await assert.rejects(service.setUnitStatus(admin, {}), NotAllowed);
  });
});
