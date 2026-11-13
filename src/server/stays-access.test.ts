import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import { createBookingService } from "@/lib/booking/booking-service";
import { createMemoryBookingStore } from "@/lib/booking/testing/memory-store";
import { createInventoryService } from "@/lib/inventory/inventory-service";
import { testApartmentTypes } from "@/lib/inventory/testing/harness";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

const allowAll = { tryConsume: async () => true, reset: async () => {} };

function services() {
  const state = memoryInventoryState();
  const common = { clock: fixedClock("2026-11-12T08:00:00Z"), ids: sequentialIds(), audit: memoryAuditRecorder(), access: { can, assertCan } };
  const inventory = createInventoryService({
    ...common,
    store: createMemoryInventoryStore(state),
    apartmentTypes: async () => testApartmentTypes,
    timeZone: "Africa/Johannesburg",
  });
  const booking = createBookingService({
    ...common,
    requests: createMemoryBookingStore(state),
    inventory,
    formTokens: { sign: () => "t", verify: () => null },
    limits: { perHour: allowAll, perDay: allowAll, siteWide: allowAll },
    random: { randomInt: () => 0 },
    consentVersions: async () => ({ consent: "0.1", notice: "0.1" }),
    email: null,
    alertAddress: async () => null,
    runAfterResponse: () => {},
    reportProblem: () => {},
    requestsPageUrl: "https://example.com/admin/requests",
  });
  return { inventory, booking };
}

describe("inventory and booking requests with the real permission matrix (roles.md)", () => {
  it("let the owner and sales see and decide requests and manage units", async () => {
    for (const role of ["owner", "sales"] as const) {
      const { inventory, booking } = services();
      assert.deepEqual(await booking.inbox.waiting(actor(role)), [], role);
      assert.equal((await inventory.addUnit(actor(role), { apartment: "family-shower", name: "Unit 1" })).ok, true, role);
      assert.equal((await inventory.overview(actor(role))).units.length, 1, role);
    }
  });

  it("refuse admin (Weberu) and staff guests' requests, units and closed nights", async () => {
    for (const role of ["admin", "staff"] as const) {
      const { inventory, booking } = services();
      await assert.rejects(booking.inbox.waiting(actor(role)), NotAllowedError, role);
      await assert.rejects(booking.inbox.handled(actor(role)), NotAllowedError, role);
      await assert.rejects(booking.decisions.decline(actor(role), "r", {}), NotAllowedError, role);
      await assert.rejects(inventory.overview(actor(role)), NotAllowedError, role);
      await assert.rejects(inventory.addUnit(actor(role), { apartment: "family-shower", name: "Unit 1" }), NotAllowedError, role);
      await assert.rejects(inventory.addBlock(actor(role), {}), NotAllowedError, role);
      await assert.rejects(inventory.setUnitOffered(actor(role), "u", false), NotAllowedError, role);
      assert.equal(await booking.inbox.waitingCount(actor(role)), 0, role);
    }
  });
});
