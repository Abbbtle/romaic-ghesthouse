import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryBookingStore } from "@/lib/booking/testing/memory-store";
import { testRequest } from "@/lib/booking/testing/store-contract";
import { createMemoryInventoryStore } from "@/lib/inventory/testing/memory-store";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import { testActor, TestNotAllowedError } from "@/lib/inventory/testing/harness";
import type { Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import type { ReservationAccess, ReservationPermission } from "./ports";
import { createReservationService } from "./reservation-service";
import type { Booking } from "./reservations";
import { createMemoryReservationStore, memoryReservationState } from "./testing/memory-store";

const grants: Record<Role, readonly ReservationPermission[]> = {
  owner: ["bookings:view", "bookings:create", "bookings:change", "bookings:cancel", "guests:view", "guests:manage", "stays:check-in-out", "today:view", "availability:view"],
  admin: [],
  sales: ["bookings:view", "bookings:create", "bookings:change", "bookings:cancel", "guests:view", "guests:manage", "stays:check-in-out", "today:view", "availability:view"],
  staff: ["stays:check-in-out", "today:view"],
};

const access: ReservationAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

const owner = testActor("owner");
const sales = testActor("sales");
const staff = testActor("staff");
const admin = testActor("admin");

function harness(now = "2026-11-12T08:00:00Z") {
  let instant = new Date(now);
  const clock: Clock = { now: () => new Date(instant) };
  const state = memoryReservationState();
  const inventory = createMemoryInventoryStore(state.inventory);
  const requests = createMemoryBookingStore(state.inventory, state.requests);
  const store = createMemoryReservationStore(state);
  const audit = memoryAuditRecorder();
  const checkedOut: Booking[] = [];
  let next = 0;
  const service = createReservationService({
    store,
    inventory,
    requests,
    quote: async (_apartment, stay) => (stay.leave > stay.arrive ? 120_000 : null),
    apartmentNames: async () => ({ "family-shower": "Family room with shower", "deluxe-double-bath": "Deluxe double room with bath" }),
    onCheckedOut: async (booking) => void checkedOut.push(booking),
    reportProblem: () => {},
    random: { randomInt: (max) => (next++ * 7) % max },
    clock,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit,
    access,
    timeZone: "Africa/Johannesburg",
  });
  return {
    service,
    state,
    inventory,
    requests,
    store,
    audit,
    checkedOut,
    setNow(value: string) {
      instant = new Date(value);
    },
    async units() {
      await inventory.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
      await inventory.addUnit(testUnit("u2", "Unit 2"), { maxUnits: 10 });
    },
  };
}

const form = (fields: Record<string, string> = {}) => ({
  unitId: "u1",
  arrive: "2026-12-10",
  leave: "2026-12-13",
  adults: "2",
  children: "0",
  total: "2400",
  depositDue: "600",
  serviceNotes: "Late arrival",
  notes: "",
  externalRef: "",
  channel: "phone",
  guestId: "",
  guestName: "Thandi Mokoena",
  guestPhone: "082 123 4567",
  guestEmail: "",
  ...fields,
});

describe("making and changing bookings", () => {
  it("books a unit for a new guest, holds its nights, and records it", async () => {
    const { service, inventory, audit, units } = harness();
    await units();
    const result = await service.create(sales, form());
    assert.equal(result.ok, true);
    const booking = await service.booking(owner, result.ok ? result.id : "");
    assert.equal(booking?.guest.phone, "+27821234567");
    assert.equal(booking?.totalCents, 240_000);
    assert.equal(booking?.depositDueCents, 60_000);
    assert.deepEqual((await inventory.blocksOverlapping(booking!.stay)).map((block) => [block.unitId, block.reason, block.bookingId]), [["u1", "booking", booking!.id]]);
    assert.equal(audit.events.at(-1)?.action, "booking.created");
  });

  it("refuses a taken night, a missing contact and a deposit above the total", async () => {
    const { service, inventory, units } = harness();
    await units();
    await inventory.addBlock(testBlock("b1", "u1", "2026-12-12", "2026-12-14"));
    assert.deepEqual(await service.create(owner, form()), {
      ok: false,
      errors: { unitId: "That unit is already taken on one of these nights. Choose another unit or other dates." },
    });
    const noContact = await service.create(owner, form({ unitId: "u2", guestPhone: "" }));
    assert.equal(noContact.ok, false);
    assert.ok(!noContact.ok && noContact.errors.guestPhone);
    const deposit = await service.create(owner, form({ unitId: "u2", depositDue: "9000" }));
    assert.ok(!deposit.ok && deposit.errors.depositDue);
  });

  it("moves a booking to another unit and dates, refusing a stale edit", async () => {
    const { service, inventory, units } = harness();
    await units();
    const created = await service.create(owner, form());
    const id = created.ok ? created.id : "";
    const change = { ...form({ unitId: "u2", arrive: "2026-12-11", leave: "2026-12-14" }), revision: "1" };
    assert.deepEqual(await service.change(sales, id, change), { ok: true });
    assert.deepEqual((await inventory.blocksOverlapping({ arrive: "2026-12-11", leave: "2026-12-14" })).map((block) => block.unitId), ["u2"]);
    assert.deepEqual(await service.change(sales, id, change), {
      ok: false,
      errors: { form: "Someone else changed this booking since you opened it. Reload the page to see their changes." },
    });
  });

  it("cancels a booking and gives its nights back", async () => {
    const { service, inventory, units } = harness();
    await units();
    const created = await service.create(owner, form());
    assert.deepEqual(await service.cancel(owner, created.ok ? created.id : "", { reason: "Plans changed" }), { ok: true });
    assert.deepEqual(await inventory.blocksOverlapping({ arrive: "2026-12-10", leave: "2026-12-13" }), []);
    assert.equal((await service.create(owner, form())).ok, true, "the nights can be booked again");
  });
});

describe("booking a channel's stay", () => {
  it("makes the booking from the stay, as that channel's, in place of the stay's hold", async () => {
    const { service, state, inventory, units, audit } = harness();
    await units();
    state.channelStays.set("s1", { id: "s1", unitId: "u1", channel: "booking-com", stay: { arrive: "2026-12-10", leave: "2026-12-13" }, status: "placeholder", bookingId: null });
    await inventory.addBlock({ ...testBlock("cb", "u1", "2026-12-10", "2026-12-13", "channel"), channelEventId: "s1" });
    assert.equal((await service.channelStay(sales, "s1"))?.channel, "booking-com");
    const result = await service.create(sales, form({ channel: "phone", channelStayId: "s1", externalRef: "4071234567" }));
    assert.equal(result.ok, true);
    const booking = await service.booking(owner, result.ok ? result.id : "");
    assert.equal(booking?.channel, "booking-com", "the stay's channel wins");
    assert.deepEqual((await inventory.blocksOverlapping(booking!.stay)).map((block) => block.reason), ["booking"]);
    assert.equal(state.channelStays.get("s1")?.status, "linked");
    assert.match(audit.events.at(-1)?.summary ?? "", /from a booking-com calendar stay/);
    assert.equal(await service.channelStay(sales, "s1"), null, "no longer offered for booking");
    assert.deepEqual(await service.create(sales, form({ unitId: "u2", channelStayId: "s1" })), {
      ok: false,
      errors: { form: "This channel stay was already made into a booking, or it's gone from the channel. Reload the page." },
    });
  });

  it("refuses staff and admin a channel stay to book", async () => {
    const { service } = harness();
    await assert.rejects(service.channelStay(staff, "s1"), TestNotAllowedError);
    await assert.rejects(service.channelStay(admin, "s1"), TestNotAllowedError);
  });
});

describe("arrivals and departures", () => {
  it("checks in from the arrival day, checks out, and tells tasks about the departure", async () => {
    const { service, units, setNow, checkedOut } = harness();
    await units();
    const created = await service.create(owner, form());
    const id = created.ok ? created.id : "";
    assert.deepEqual(await service.checkIn(staff, id), { ok: false, errors: { form: "The guest can check in from their arrival day." } });
    setNow("2026-12-10T12:00:00Z");
    assert.deepEqual(await service.checkIn(staff, id), { ok: true });
    assert.deepEqual(await service.checkOut(staff, id), { ok: true });
    assert.deepEqual(
      checkedOut.map((booking) => booking.id),
      [id],
    );
  });

  it("ends the stay today when the guest leaves early, opening the nights left", async () => {
    const { service, inventory, units, setNow, checkedOut } = harness();
    await units();
    const created = await service.create(owner, form());
    const id = created.ok ? created.id : "";
    setNow("2026-12-10T12:00:00Z");
    await service.checkIn(staff, id);
    setNow("2026-12-11T09:00:00Z");
    assert.deepEqual(await service.checkOut(staff, id), { ok: true });
    assert.deepEqual((await service.booking(owner, id))?.stay, { arrive: "2026-12-10", leave: "2026-12-11" });
    assert.deepEqual((await inventory.blocksOverlapping({ arrive: "2026-12-11", leave: "2026-12-13" })).length, 0, "12 and 13 December are free again");
    assert.equal(checkedOut[0]?.stay.leave, "2026-12-11", "the clean is for today");
  });

  it("keeps the first night when the guest leaves on the arrival day", async () => {
    const { service, units, setNow } = harness();
    await units();
    const created = await service.create(owner, form());
    const id = created.ok ? created.id : "";
    setNow("2026-12-10T12:00:00Z");
    await service.checkIn(staff, id);
    await service.checkOut(staff, id);
    assert.deepEqual((await service.booking(owner, id))?.stay, { arrive: "2026-12-10", leave: "2026-12-11" });
  });

  it("marks a no-show only from the arrival day, freeing the nights", async () => {
    const { service, inventory, units, setNow } = harness();
    await units();
    const created = await service.create(owner, form());
    const id = created.ok ? created.id : "";
    assert.deepEqual(await service.noShow(staff, id), { ok: false, errors: { form: "A guest can only be a no-show from their arrival day." } });
    setNow("2026-12-10T20:00:00Z");
    assert.deepEqual(await service.noShow(staff, id), { ok: true });
    assert.deepEqual(await inventory.blocksOverlapping({ arrive: "2026-12-10", leave: "2026-12-13" }), []);
  });

  it("gives staff only the guest's name, the unit, the dates and the service notes", async () => {
    const { service, units, setNow } = harness();
    await units();
    await service.create(owner, form({ guestEmail: "thandi@example.com" }));
    setNow("2026-12-10T07:00:00Z");
    const view = await service.todayView(staff);
    assert.ok("staff" in view);
    const [arrival] = view.staff.arrivals;
    assert.deepEqual(Object.keys(arrival!).sort(), ["guestName", "id", "serviceNotes", "status", "stay", "unitName"]);
    assert.equal(arrival!.unitName, "Unit 1");
    assert.doesNotMatch(JSON.stringify(view), /\+2782|thandi@|240000|60000|phone/);
    const full = await service.todayView(owner);
    assert.ok("full" in full && full.full.arrivals[0]?.guest.phone === "+27821234567");
  });
});

describe("accepting a booking request", () => {
  async function waitingRequest() {
    const h = harness();
    await h.units();
    const request = testRequest({ stay: { arrive: "2026-12-10", leave: "2026-12-13" } });
    await h.requests.create(request, { maxWaitingPerPhone: 3, today: "2026-11-12" });
    return { ...h, request };
  }

  it("turns it into a booking with the agreed price, keeping its reference", async () => {
    const { service, requests, request } = await waitingRequest();
    const result = await service.acceptRequest(sales, request.id, { unitId: "u1", total: "2400", depositDue: "0" });
    assert.equal(result.ok, true);
    const booking = await service.booking(owner, result.ok ? result.id : "");
    assert.equal(booking?.ref, request.ref);
    assert.equal(booking?.requestId, request.id);
    assert.equal(booking?.serviceNotes, "Arriving About 18:00");
    assert.equal((await requests.request(request.id))?.decision?.bookingId, booking?.id);
  });

  it("reuses the guest with the same phone, and refuses a unit of another apartment", async () => {
    const { service, request } = await waitingRequest();
    const first = await service.create(owner, form({ unitId: "u2", arrive: "2027-01-10", leave: "2027-01-11", guestName: "Thandi M." }));
    assert.deepEqual(await service.acceptRequest(owner, request.id, { unitId: "u3", total: "1", depositDue: "0" }), {
      ok: false,
      errors: { unitId: "Choose a unit of the room type the guest asked for." },
    });
    const accepted = await service.acceptRequest(owner, request.id, { unitId: "u1", total: "2400", depositDue: "0" });
    const a = await service.booking(owner, first.ok ? first.id : "");
    const b = await service.booking(owner, accepted.ok ? accepted.id : "");
    assert.equal(a?.guestId, b?.guestId);
  });
});

describe("who may do what", () => {
  it("refuses admin everything, and staff everything but Today and check-in, check-out and no-shows", async () => {
    const { service, units } = harness();
    await units();
    for (const actor of [admin, staff]) {
      await assert.rejects(service.list(actor, { arrive: "2026-12-01", leave: "2026-12-31" }), TestNotAllowedError);
      await assert.rejects(service.search(actor, "Thandi"), TestNotAllowedError);
      await assert.rejects(service.booking(actor, "b"), TestNotAllowedError);
      await assert.rejects(service.create(actor, form()), TestNotAllowedError);
      await assert.rejects(service.change(actor, "b", {}), TestNotAllowedError);
      await assert.rejects(service.cancel(actor, "b", {}), TestNotAllowedError);
      await assert.rejects(service.acceptRequest(actor, "r", {}), TestNotAllowedError);
      await assert.rejects(service.searchGuests(actor, "Thandi"), TestNotAllowedError);
      await assert.rejects(service.guest(actor, "g"), TestNotAllowedError);
      await assert.rejects(service.updateGuest(actor, "g", {}), TestNotAllowedError);
      await assert.rejects(service.chart(actor, "2026-12-01", 14), TestNotAllowedError);
    }
    await assert.rejects(service.todayView(admin), TestNotAllowedError);
    await assert.rejects(service.checkIn(admin, "b"), TestNotAllowedError);
    await assert.rejects(service.noShow(admin, "b"), TestNotAllowedError);
  });
});
