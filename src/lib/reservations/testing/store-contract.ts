import type { BookingStore } from "@/lib/booking/ports";
import { testRequest } from "@/lib/booking/testing/store-contract";
import type { InventoryStore } from "@/lib/inventory/ports";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { ReservationStore } from "../ports";
import type { Booking, ChannelStay, Guest } from "../reservations";

/**
 * What every ReservationStore must do, with the inventory and booking-request
 * stores over the same data, as cases run on a fresh, empty set:
 *
 *   for (const { name, run } of reservationStoreContract) it(name, async () => run(await emptyStores()));
 */
export type ReservationStores = {
  reservations: ReservationStore;
  requests: BookingStore;
  inventory: InventoryStore;
  /** Puts a stay imported from a channel's calendar in place, with the block that holds its nights (none for a conflict). */
  seedChannelStay: (stay: ChannelStay, block: AvailabilityBlock | null) => Promise<void>;
};

export function testChannelStay(id: string, unitId: string, arrive: string, leave: string, status: ChannelStay["status"] = "placeholder"): ChannelStay {
  return { id, unitId, channel: "booking-com", stay: { arrive, leave }, status, bookingId: null };
}

export function channelBlockOf(stay: ChannelStay, id: string): AvailabilityBlock {
  return { ...testBlock(id, stay.unitId, stay.stay.arrive, stay.stay.leave, "channel"), channelEventId: stay.id };
}

export type ReservationStoreCase = { name: string; run: (stores: ReservationStores) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const unitA = "00000000-0000-4000-8000-00000000a0a1";
const unitB = "00000000-0000-4000-8000-00000000a0b2";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

export function testGuest(id: string, fields: Partial<Guest> = {}): Guest {
  return { id, name: "Thandi Mokoena", phone: "+27821234567", email: "thandi@example.com", notes: null, createdAt: at, updatedAt: at, ...fields };
}

export function testBooking(id: string, guestId: string, fields: Partial<Booking> = {}): Booking {
  return {
    id,
    ref: "RG-B2C3D",
    guestId,
    channel: "phone",
    status: "confirmed",
    apartment: "family-shower",
    unitId: unitA,
    stay: { arrive: "2026-12-10", leave: "2026-12-13" },
    adults: 2,
    children: 1,
    totalCents: 240_000,
    depositDueCents: 60_000,
    serviceNotes: "Late arrival",
    notes: null,
    externalRef: null,
    requestId: null,
    createdBy: ownerId,
    createdAt: at,
    updatedAt: at,
    revision: 1,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancelReason: null,
    ...fields,
  };
}

export function blockOf(booking: Booking, id: string): AvailabilityBlock {
  return { ...testBlock(id, booking.unitId, booking.stay.arrive, booking.stay.leave, "booking"), bookingId: booking.id };
}

const guest1 = "00000000-0000-4000-8000-00000000c001";
const booking1 = "00000000-0000-4000-8000-00000000d001";
const booking2 = "00000000-0000-4000-8000-00000000d002";
const block1 = "00000000-0000-4000-8000-0000000b0001";
const block2 = "00000000-0000-4000-8000-0000000b0002";
const block3 = "00000000-0000-4000-8000-0000000b0003";
const stay1 = "00000000-0000-4000-8000-0000000e5001";
const stay2 = "00000000-0000-4000-8000-0000000e5002";

async function withUnits(inventory: InventoryStore) {
  await inventory.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
  await inventory.addUnit(testUnit(unitB, "Unit 2"), { maxUnits: 10 });
}

export const reservationStoreContract: readonly ReservationStoreCase[] = [
  {
    name: "makes a booking from a channel stay at once: the stay's block goes, the booking's goes in, and the stay is linked",
    async run({ reservations, inventory, seedChannelStay }) {
      await withUnits(inventory);
      const placeholder = testChannelStay(stay1, unitA, "2026-12-10", "2026-12-13");
      await seedChannelStay(placeholder, channelBlockOf(placeholder, block1));
      expectSame(await reservations.channelStay(stay1), placeholder, "read back");
      expectSame((await reservations.channelStaysToBook("2026-12-12", 10)).map((stay) => stay.id), [stay1], "to book");
      expectSame(await reservations.channelStaysToBook("2026-12-13", 10), [], "ended by then");
      const booking = testBooking(booking1, guest1, { channel: "booking-com" });
      const creation = { newGuest: testGuest(guest1), booking, block: blockOf(booking, block2), channelStayId: stay1 };
      expectSame(await reservations.convertChannelStay(creation), { status: "created" }, "convert");
      expectSame((await inventory.blocksOverlapping(booking.stay)).map((block) => [block.id, block.reason]), [[block2, "booking"]], "only the booking holds the nights");
      expectSame(await reservations.channelStay(stay1), { ...placeholder, status: "linked", bookingId: booking1 }, "linked");
      expectSame(await reservations.channelStaysToBook("2026-12-01", 10), [], "booked now");
      const again = testBooking(booking2, guest1, { ref: "RG-F6G7H", unitId: unitB });
      expectSame(await reservations.convertChannelStay({ newGuest: null, booking: again, block: blockOf(again, block3), channelStayId: stay1 }), { status: "stay-changed" }, "only once");
      const cancel = { bookingId: booking1, from: ["confirmed"] as const, to: "cancelled" as const, at: later, releaseNights: true, cancelReason: "Guest cancelled" };
      expectSame(await reservations.setStatus(cancel), true, "cancel");
      expectSame(await reservations.channelStay(stay1), null, "the stay is let go, for the next sync to re-import");
    },
  },
  {
    name: "ends a stay early on check-out, with its block, when asked",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const booking = testBooking(booking1, guest1, { status: "checked-in" });
      await reservations.create({ newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) });
      expectSame(await reservations.setStatus({ bookingId: booking1, from: ["checked-in"], to: "checked-out", at: later, releaseNights: false, leaveOn: "2026-12-11" }), true, "out");
      expectSame((await reservations.booking(booking1))?.stay, { arrive: "2026-12-10", leave: "2026-12-11" }, "booking ends early");
      expectSame((await inventory.blocksOverlapping({ arrive: "2026-12-10", leave: "2026-12-13" })).map((block) => block.stay), [{ arrive: "2026-12-10", leave: "2026-12-11" }], "block too");
    },
  },
  {
    name: "keeps a channel stay and its block as they were when its booking can't go in",
    async run({ reservations, inventory, seedChannelStay }) {
      await withUnits(inventory);
      await inventory.addBlock(testBlock(block3, unitA, "2027-01-05", "2027-01-07"));
      const placeholder = testChannelStay(stay1, unitB, "2027-01-05", "2027-01-07");
      await seedChannelStay(placeholder, channelBlockOf(placeholder, block1));
      const conflict = testChannelStay(stay2, unitA, "2027-01-05", "2027-01-07", "conflict");
      await seedChannelStay(conflict, null);
      const intoTaken = testBooking(booking1, guest1, { channel: "booking-com", unitId: unitA, stay: placeholder.stay });
      const refused = await reservations.convertChannelStay({ newGuest: testGuest(guest1), booking: intoTaken, block: blockOf(intoTaken, block2), channelStayId: stay1 });
      expectSame(refused.status, "overlaps", "unit A is closed");
      expectSame((await inventory.blocksOverlapping(placeholder.stay)).map((block) => block.id).sort(), [block1, block3].sort(), "the stay's block is back");
      expectSame(await reservations.channelStay(stay1), placeholder, "still a placeholder");
      const conflictToB = testBooking(booking2, guest1, { ref: "RG-F6G7H", channel: "booking-com", unitId: unitB, stay: conflict.stay });
      expectSame(
        (await reservations.convertChannelStay({ newGuest: testGuest(guest1), booking: conflictToB, block: blockOf(conflictToB, block2), channelStayId: stay2 })).status,
        "overlaps",
        "unit B is held by the placeholder",
      );
      expectSame(await reservations.channelStay(stay2), conflict, "still a conflict");
    },
  },
  {
    name: "stores a booking with a new guest and its nights, and reads it back",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const booking = testBooking(booking1, guest1);
      expectSame(await reservations.create({ newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) }), { status: "created" }, "create");
      expectSame(await reservations.booking(booking1), { ...booking, guest: testGuest(guest1) }, "read back");
      expectSame((await inventory.blocksOverlapping(booking.stay)).map((block) => [block.bookingId, block.reason]), [[booking1, "booking"]], "block");
      expectSame((await reservations.bookingsForGuest(guest1)).map((stored) => stored.id), [booking1], "guest's bookings");
    },
  },
  {
    name: "refuses a taken reference, a missing guest and a night already held, storing nothing",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const first = testBooking(booking1, guest1);
      await reservations.create({ newGuest: testGuest(guest1), booking: first, block: blockOf(first, block1) });
      const sameRef = testBooking(booking2, guest1, { unitId: unitB });
      expectSame(await reservations.create({ newGuest: null, booking: sameRef, block: blockOf(sameRef, block2) }), { status: "ref-taken" }, "same reference");
      const noGuest = testBooking(booking2, "00000000-0000-4000-8000-00000000c0ff", { ref: "RG-C3D4E", unitId: unitB });
      expectSame(await reservations.create({ newGuest: null, booking: noGuest, block: blockOf(noGuest, block2) }), { status: "guest-missing" }, "missing guest");
      const clash = testBooking(booking2, guest1, { ref: "RG-C3D4E", stay: { arrive: "2026-12-12", leave: "2026-12-14" } });
      expectSame(await reservations.create({ newGuest: null, booking: clash, block: blockOf(clash, block2) }), { status: "overlaps" }, "taken night");
      expectSame(await reservations.booking(booking2), null, "nothing stored");
    },
  },
  {
    name: "moves a booking's nights with it, refusing a stale revision or a taken night",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const booking = testBooking(booking1, guest1);
      await reservations.create({ newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) });
      await inventory.addBlock(testBlock(block2, unitB, "2026-12-20", "2026-12-22"));
      const moved = { ...booking, unitId: unitB, stay: { arrive: "2026-12-15", leave: "2026-12-18" }, revision: 2 };
      expectSame(await reservations.change({ booking: moved, expectedRevision: 1 }), { status: "changed" }, "change");
      expectSame((await inventory.blocksOverlapping({ arrive: "2026-12-15", leave: "2026-12-18" })).map((block) => block.unitId), [unitB], "block moved");
      expectSame(await inventory.blocksOverlapping(booking.stay), [], "old nights free");
      expectSame(await reservations.change({ booking: { ...moved, revision: 3 }, expectedRevision: 1 }), { status: "stale" }, "stale");
      const clash = { ...moved, stay: { arrive: "2026-12-19", leave: "2026-12-21" }, revision: 3 };
      expectSame(await reservations.change({ booking: clash, expectedRevision: 2 }), { status: "overlaps" }, "taken");
      expectSame((await reservations.booking(booking1))?.stay, moved.stay, "unchanged after refusal");
    },
  },
  {
    name: "changes status only from the states allowed, giving nights back when asked",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const booking = testBooking(booking1, guest1);
      await reservations.create({ newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) });
      expectSame(await reservations.setStatus({ bookingId: booking1, from: ["checked-in"], to: "checked-out", at: later, releaseNights: false }), false, "wrong state");
      expectSame(await reservations.setStatus({ bookingId: booking1, from: ["confirmed"], to: "checked-in", at: later, releaseNights: false }), true, "check in");
      const checkedIn = await reservations.booking(booking1);
      expectSame([checkedIn?.status, checkedIn?.checkedInAt, checkedIn?.revision], ["checked-in", later, 2], "checked in");
      const second = testBooking(booking2, guest1, { ref: "RG-C3D4E", unitId: unitB });
      await reservations.create({ newGuest: null, booking: second, block: blockOf(second, block2) });
      expectSame(
        await reservations.setStatus({ bookingId: booking2, from: ["confirmed"], to: "cancelled", at: later, releaseNights: true, cancelReason: "Plans changed" }),
        true,
        "cancel",
      );
      const cancelled = await reservations.booking(booking2);
      expectSame([cancelled?.status, cancelled?.cancelReason, cancelled?.cancelledAt], ["cancelled", "Plans changed", later], "cancelled");
      expectSame((await inventory.blocksOverlapping(second.stay)).map((block) => block.bookingId), [booking1], "its nights are free again");
    },
  },
  {
    name: "accepts a waiting request into a booking, all at once, and only once",
    async run({ reservations, requests, inventory }) {
      await withUnits(inventory);
      const request = testRequest();
      await requests.create(request, { maxWaitingPerPhone: 3, today: "2026-11-12" });
      const booking = testBooking(booking1, guest1, { ref: request.ref, requestId: request.id, channel: "direct" });
      const conversion = { requestId: request.id, today: "2026-11-12", at: later, by: ownerId, newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) };
      expectSame(await reservations.convertRequest(conversion), { status: "created" }, "accept");
      const accepted = await requests.request(request.id);
      expectSame([accepted?.status, accepted?.decision?.bookingId], ["accepted", booking1], "request accepted");
      expectSame(
        await reservations.convertRequest({ ...conversion, booking: { ...booking, id: booking2, ref: "RG-C3D4E" }, block: blockOf({ ...booking, id: booking2 }, block2) }),
        { status: "request-changed" },
        "again",
      );
    },
  },
  {
    name: "leaves a request waiting when its booking can't take the nights",
    async run({ reservations, requests, inventory }) {
      await withUnits(inventory);
      await inventory.addBlock(testBlock(block2, unitA, "2026-12-11", "2026-12-12"));
      const request = testRequest();
      await requests.create(request, { maxWaitingPerPhone: 3, today: "2026-11-12" });
      const booking = testBooking(booking1, guest1, { ref: request.ref, requestId: request.id });
      expectSame(
        await reservations.convertRequest({ requestId: request.id, today: "2026-11-12", at: later, by: ownerId, newGuest: testGuest(guest1), booking, block: blockOf(booking, block1) }),
        { status: "overlaps" },
        "taken",
      );
      expectSame((await requests.request(request.id))?.status, "waiting", "still waiting");
      expectSame(await reservations.guest(guest1), null, "no guest stored");
    },
  },
  {
    name: "finds bookings around a day, by search, and guests by name or phone",
    async run({ reservations, inventory }) {
      await withUnits(inventory);
      const arriving = testBooking(booking1, guest1, { stay: { arrive: "2026-12-10", leave: "2026-12-13" } });
      await reservations.create({ newGuest: testGuest(guest1), booking: arriving, block: blockOf(arriving, block1) });
      const guest2 = "00000000-0000-4000-8000-00000000c002";
      const leaving = testBooking(booking2, guest2, { ref: "RG-C3D4E", unitId: unitB, stay: { arrive: "2026-12-08", leave: "2026-12-10" }, status: "checked-in" });
      await reservations.create({ newGuest: testGuest(guest2, { name: "Pieter van Wyk", phone: "+27831112222", email: null }), booking: leaving, block: blockOf(leaving, block2) });
      expectSame((await reservations.bookingsAround("2026-12-10")).map((booking) => booking.id).sort(), [booking1, booking2].sort(), "around the 10th");
      expectSame((await reservations.bookingsAround("2026-12-14")).map((booking) => booking.id), [], "after both");
      expectSame((await reservations.search("van wyk", 10)).map((booking) => booking.id), [booking2], "by name");
      expectSame((await reservations.search("rg-b2c3d", 10)).map((booking) => booking.id), [booking1], "by reference");
      expectSame((await reservations.searchGuests("0831112", 10)).map((guest) => guest.id), [], "phone digits must match as stored");
      expectSame((await reservations.searchGuests("+2783111", 10)).map((guest) => guest.id), [guest2], "by phone");
      const updated = { ...testGuest(guest2, { name: "Pieter van Wyk", phone: "+27831112222", email: null }), notes: "Prefers ground floor", updatedAt: later };
      expectSame(await reservations.updateGuest(updated), true, "update");
      expectSame((await reservations.guest(guest2))?.notes, "Prefers ground floor", "updated");
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
