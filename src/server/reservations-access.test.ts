import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import { createMemoryBookingStore } from "@/lib/booking/testing/memory-store";
import { createMemoryInventoryStore } from "@/lib/inventory/testing/memory-store";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createReservationService } from "@/lib/reservations/reservation-service";
import { createMemoryReservationStore, memoryReservationState } from "@/lib/reservations/testing/memory-store";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

const booking = {
  unitId: "u1",
  arrive: "2026-11-12",
  leave: "2026-11-14",
  adults: "2",
  children: "0",
  total: "1700",
  depositDue: "0",
  serviceNotes: "Cot in the room",
  notes: "Paid cash last time",
  externalRef: "",
  channel: "walk-in",
  guestId: "",
  guestName: "Thandi Mokoena",
  guestPhone: "082 123 4567",
  guestEmail: "thandi@example.com",
};

async function services() {
  const state = memoryReservationState();
  const inventory = createMemoryInventoryStore(state.inventory);
  await inventory.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
  const reservations = createReservationService({
    store: createMemoryReservationStore(state),
    inventory,
    requests: createMemoryBookingStore(state.inventory, state.requests),
    quote: async () => null,
    apartmentNames: async () => ({ "family-shower": "Family room with shower" }),
    onCheckedOut: async () => {},
    reportProblem: () => {},
    random: { randomInt: () => 0 },
    clock: fixedClock("2026-11-12T08:00:00Z"),
    ids: sequentialIds(),
    audit: memoryAuditRecorder(),
    access: { can, assertCan },
    timeZone: "Africa/Johannesburg",
  });
  const made = await reservations.create(actor("owner"), booking);
  assert.ok(made.ok);
  return { reservations, id: made.id };
}

describe("bookings and guests with the real permission matrix (roles.md)", () => {
  it("let the owner and sales make, see, change and cancel bookings, and see and change guests", async () => {
    for (const role of ["owner", "sales"] as const) {
      const { reservations, id } = await services();
      const who = actor(role);
      const found = await reservations.booking(who, id);
      assert.equal(found?.guest.email, "thandi@example.com", role);
      assert.equal((await reservations.search(who, "Thandi")).length, 1, role);
      assert.equal((await reservations.searchGuests(who, "Thandi")).length, 1, role);
      assert.equal((await reservations.chart(who, "2026-11-12", 14)).units.length, 1, role);
      assert.deepEqual(await reservations.updateGuest(who, found!.guestId, { name: "Thandi M.", phone: "082 123 4567", email: "", notes: "" }), { ok: true }, role);
      assert.deepEqual(await reservations.checkIn(who, id), { ok: true }, role);
      const view = await reservations.todayView(who);
      assert.ok("full" in view, role);
    }
  });

  it("give staff Today with names, units, dates and service notes only, and check-in and check-out", async () => {
    const { reservations, id } = await services();
    const staff = actor("staff");
    const view = await reservations.todayView(staff);
    assert.ok("staff" in view);
    assert.deepEqual(Object.keys(view.staff.arrivals[0]!).sort(), ["guestName", "id", "serviceNotes", "status", "stay", "unitName"]);
    assert.doesNotMatch(JSON.stringify(view), /thandi@|\+2782|170000|Paid cash/);
    assert.deepEqual(await reservations.checkIn(staff, id), { ok: true });
    assert.deepEqual(await reservations.checkOut(staff, id), { ok: true });
  });

  it("refuse admin (Weberu) every booking, guest, chart and Today read, and every change", async () => {
    const { reservations, id } = await services();
    const admin = actor("admin");
    await assert.rejects(reservations.list(admin, { arrive: "2026-11-01", leave: "2026-12-01" }), NotAllowedError);
    await assert.rejects(reservations.search(admin, "Thandi"), NotAllowedError);
    await assert.rejects(reservations.booking(admin, id), NotAllowedError);
    await assert.rejects(reservations.create(admin, booking), NotAllowedError);
    await assert.rejects(reservations.change(admin, id, {}), NotAllowedError);
    await assert.rejects(reservations.cancel(admin, id, {}), NotAllowedError);
    await assert.rejects(reservations.acceptRequest(admin, "r", {}), NotAllowedError);
    await assert.rejects(reservations.searchGuests(admin, "Thandi"), NotAllowedError);
    await assert.rejects(reservations.guest(admin, "g"), NotAllowedError);
    await assert.rejects(reservations.updateGuest(admin, "g", {}), NotAllowedError);
    await assert.rejects(reservations.chart(admin, "2026-11-12", 14), NotAllowedError);
    await assert.rejects(reservations.todayView(admin), NotAllowedError);
    await assert.rejects(reservations.checkIn(admin, id), NotAllowedError);
    await assert.rejects(reservations.checkOut(admin, id), NotAllowedError);
    await assert.rejects(reservations.noShow(admin, id), NotAllowedError);
  });

  it("refuse staff bookings, guests and the chart beyond Today", async () => {
    const { reservations, id } = await services();
    const staff = actor("staff");
    await assert.rejects(reservations.booking(staff, id), NotAllowedError);
    await assert.rejects(reservations.list(staff, { arrive: "2026-11-01", leave: "2026-12-01" }), NotAllowedError);
    await assert.rejects(reservations.create(staff, booking), NotAllowedError);
    await assert.rejects(reservations.cancel(staff, id, {}), NotAllowedError);
    await assert.rejects(reservations.searchGuests(staff, "Thandi"), NotAllowedError);
    await assert.rejects(reservations.chart(staff, "2026-11-12", 14), NotAllowedError);
  });
});
