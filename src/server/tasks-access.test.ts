import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createTaskService } from "@/lib/tasks/task-service";
import { createMemoryTaskStore } from "@/lib/tasks/testing/memory-store";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

async function service() {
  const state = memoryInventoryState();
  const inventory = createMemoryInventoryStore(state);
  await inventory.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
  return createTaskService({
    store: createMemoryTaskStore(state),
    units: () => inventory.units(),
    people: async () => [],
    departures: async () => [],
    clock: fixedClock("2026-11-12T08:00:00Z"),
    ids: sequentialIds(),
    audit: memoryAuditRecorder(),
    access: { can, assertCan },
    timeZone: "Africa/Johannesburg",
  });
}

describe("tasks with the real permission matrix (roles.md)", () => {
  it("let the owner, sales and staff work tasks and set unit statuses; only the owner and sales set work", async () => {
    for (const role of ["owner", "sales", "staff"] as const) {
      const tasks = await service();
      assert.equal((await tasks.reportProblem(actor(role), { unitId: "u1", title: "Loose tile", notes: "", priority: "normal" })).ok, true, role);
      assert.equal((await tasks.setUnitStatus(actor(role), { unitId: "u1", status: "dirty", note: "" })).ok, true, role);
      assert.equal((await tasks.toClean(actor(role))).units.length, 1, role);
      const create = tasks.create(actor(role), { kind: "maintenance", unitId: "u1", title: "Paint", notes: "", priority: "normal", dueOn: "2026-11-13", assignedTo: "" });
      if (role === "staff") await assert.rejects(create, NotAllowedError);
      else assert.equal((await create).ok, true, role);
    }
  });

  it("refuse admin (Weberu) every task, status and Today view", async () => {
    const tasks = await service();
    const admin = actor("admin");
    await assert.rejects(tasks.board(admin, "open"), NotAllowedError);
    await assert.rejects(tasks.toClean(admin), NotAllowedError);
    await assert.rejects(tasks.reportProblem(admin, {}), NotAllowedError);
    await assert.rejects(tasks.create(admin, {}), NotAllowedError);
    await assert.rejects(tasks.unitStatuses(admin), NotAllowedError);
    await assert.rejects(tasks.setUnitStatus(admin, {}), NotAllowedError);
  });
});
