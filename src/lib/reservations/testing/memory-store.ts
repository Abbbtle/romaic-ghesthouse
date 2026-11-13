import type { BookingRequest } from "@/lib/booking/requests";
import { statusOn } from "@/lib/booking/requests";
import { memoryBlockOutcome, memoryInventoryState, type MemoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { staysOverlap } from "@/lib/inventory/stays";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { BookingCreation, ChangeOutcome, ChannelStayOutcome, ConvertOutcome, CreateOutcome, ReservationStore } from "../ports";
import { canBookChannelStay, type Booking, type BookingWithGuest, type ChannelStay, type Guest } from "../reservations";

/**
 * Bookings and guests in memory, for tests, keeping the Postgres store's
 * rules (./store-contract.ts checks both). It shares the inventory's units
 * and blocks, and the booking-request store's requests, so a booking's
 * nights and an accepted request behave as they do in one database.
 */
export type MemoryReservationState = {
  inventory: MemoryInventoryState;
  requests: Map<string, BookingRequest>;
  guests: Map<string, Guest>;
  bookings: Map<string, Booking>;
  /** Stays imported from channels' calendars (the channels store keeps them in one database with the rest). */
  channelStays: Map<string, ChannelStay>;
};

export function memoryReservationState(inventory: MemoryInventoryState = memoryInventoryState()): MemoryReservationState {
  return { inventory, requests: new Map(), guests: new Map(), bookings: new Map(), channelStays: new Map() };
}

const copy = <T>(value: T): T => structuredClone(value);

export function createMemoryReservationStore(state: MemoryReservationState = memoryReservationState()): ReservationStore {
  const { inventory, guests, bookings } = state;
  const withGuest = (booking: Booking): BookingWithGuest => copy({ ...booking, guest: guests.get(booking.guestId)! });
  const blockOf = (bookingId: string) => [...inventory.blocks.values()].find((block) => block.bookingId === bookingId);
  const sorted = (list: Booking[]) => list.sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive) || a.createdAt.getTime() - b.createdAt.getTime());

  function create({ newGuest, booking, block }: BookingCreation): CreateOutcome {
    if ([...bookings.values()].some((other) => other.ref === booking.ref)) return { status: "ref-taken" };
    if (!newGuest && !guests.has(booking.guestId)) return { status: "guest-missing" };
    const outcome = memoryBlockOutcome(inventory, block);
    if (outcome.status !== "added") return outcome;
    if (newGuest) guests.set(newGuest.id, copy(newGuest));
    bookings.set(booking.id, copy(booking));
    inventory.blocks.set(block.id, copy(block));
    return { status: "created" };
  }

  const matches = (text: string | null, query: string) => text !== null && text.toLowerCase().includes(query.toLowerCase());

  return {
    async booking(id) {
      const booking = bookings.get(id);
      return booking ? withGuest(booking) : null;
    },
    async bookingsOverlapping(range) {
      return sorted([...bookings.values()].filter((booking) => staysOverlap(booking.stay, range))).map(withGuest);
    },
    async bookingsAround(day) {
      return sorted(
        [...bookings.values()].filter(
          (booking) => (booking.status === "confirmed" || booking.status === "checked-in") && booking.stay.arrive <= day && booking.stay.leave >= day,
        ),
      ).map(withGuest);
    },
    async search(query, limit) {
      return [...bookings.values()]
        .filter((booking) => {
          const guest = guests.get(booking.guestId)!;
          return matches(booking.ref, query) || matches(guest.name, query) || matches(guest.phone, query) || matches(guest.email, query);
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(withGuest);
    },
    async guest(id) {
      const guest = guests.get(id);
      return guest ? copy(guest) : null;
    },
    async searchGuests(query, limit) {
      return [...guests.values()]
        .filter((guest) => matches(guest.name, query) || matches(guest.phone, query) || matches(guest.email, query))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit)
        .map(copy);
    },
    async bookingsForGuest(guestId) {
      return [...bookings.values()].filter((booking) => booking.guestId === guestId).sort((a, b) => b.stay.arrive.localeCompare(a.stay.arrive)).map(copy);
    },
    async updateGuest(guest) {
      if (!guests.has(guest.id)) return false;
      guests.set(guest.id, copy(guest));
      return true;
    },
    async create(creation) {
      return create(creation);
    },
    async convertRequest(conversion): Promise<ConvertOutcome> {
      const request = state.requests.get(conversion.requestId);
      if (!request || statusOn(request, conversion.today) !== "waiting") return { status: "request-changed" };
      const outcome = create(conversion);
      if (outcome.status !== "created") return outcome;
      state.requests.set(request.id, { ...request, status: "accepted", decision: { at: conversion.at, by: conversion.by, note: null, bookingId: conversion.booking.id } });
      return outcome;
    },
    async channelStay(id) {
      const stay = state.channelStays.get(id);
      return stay ? copy(stay) : null;
    },
    async channelStaysToBook(from, limit) {
      return [...state.channelStays.values()]
        .filter((stay) => canBookChannelStay(stay) && stay.stay.leave > from)
        .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive))
        .slice(0, limit)
        .map(copy);
    },
    async convertChannelStay(conversion): Promise<ChannelStayOutcome> {
      const stay = state.channelStays.get(conversion.channelStayId);
      if (!stay || !canBookChannelStay(stay)) return { status: "stay-changed" };
      const held = [...inventory.blocks.values()].filter((block) => block.channelEventId === stay.id);
      for (const block of held) inventory.blocks.delete(block.id);
      const outcome = create(conversion);
      if (outcome.status !== "created") {
        for (const block of held) inventory.blocks.set(block.id, block);
        return outcome;
      }
      state.channelStays.set(stay.id, { ...stay, status: "linked", bookingId: conversion.booking.id });
      return outcome;
    },
    async change({ booking, expectedRevision }): Promise<ChangeOutcome> {
      const current = bookings.get(booking.id);
      if (!current) return { status: "missing" };
      if (current.revision !== expectedRevision) return { status: "stale" };
      const block = blockOf(booking.id);
      if (block) {
        const moved: AvailabilityBlock = { ...block, unitId: booking.unitId, stay: booking.stay };
        inventory.blocks.delete(block.id);
        const outcome = memoryBlockOutcome(inventory, moved);
        if (outcome.status !== "added") {
          inventory.blocks.set(block.id, block);
          return outcome;
        }
        inventory.blocks.set(block.id, moved);
      }
      bookings.set(booking.id, copy(booking));
      return { status: "changed" };
    },
    async setStatus(change) {
      const current = bookings.get(change.bookingId);
      if (!current || !change.from.includes(current.status)) return false;
      const at = change.at;
      bookings.set(current.id, {
        ...current,
        status: change.to,
        updatedAt: at,
        revision: current.revision + 1,
        checkedInAt: change.to === "checked-in" ? at : current.checkedInAt,
        checkedOutAt: change.to === "checked-out" ? at : current.checkedOutAt,
        cancelledAt: change.to === "cancelled" || change.to === "no-show" ? at : current.cancelledAt,
        cancelReason: change.to === "cancelled" ? (change.cancelReason ?? null) : current.cancelReason,
        stay: change.leaveOn ? { arrive: current.stay.arrive, leave: change.leaveOn } : current.stay,
      });
      if (change.leaveOn) {
        const block = blockOf(current.id);
        if (block) inventory.blocks.set(block.id, { ...block, stay: { arrive: block.stay.arrive, leave: change.leaveOn } });
      }
      if (change.to === "cancelled") {
        for (const stay of state.channelStays.values()) if (stay.bookingId === current.id) state.channelStays.delete(stay.id);
      }
      if (change.releaseNights) {
        const block = blockOf(current.id);
        if (block) inventory.blocks.delete(block.id);
      }
      return true;
    },
  };
}
