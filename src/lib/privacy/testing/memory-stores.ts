import { businessTimeZone, compareIsoDates, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Booking, BookingStatus, Guest } from "@/lib/reservations/reservations";
import type { GuestAnonymising, GuestRecords, PrivacyStore, RetentionStore } from "../ports";
import { activeStayStatuses, anonymisedGuestName, type Breach, type DataSubjectRequest, type InformationOfficer } from "../privacy";
import type { RetentionPolicy, RetentionRun } from "../retention";

/**
 * The privacy stores in memory, for tests, with the Postgres stores' rules
 * (./store-contract.ts checks both).
 */

const copy = <T>(value: T): T => structuredClone(value);

export function createMemoryPrivacyStore(): PrivacyStore {
  const requests = new Map<string, DataSubjectRequest>();
  const breaches = new Map<string, Breach>();
  const policies: RetentionPolicy[] = [];
  const runs: RetentionRun[] = [];
  let officer: InformationOfficer | null = null;
  const newestFirst = <T extends { createdAt: Date }>(list: T[]) => list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    async requests() {
      return newestFirst([...requests.values()]).map(copy);
    },
    async request(id) {
      const found = requests.get(id);
      return found ? copy(found) : null;
    },
    async addRequest(request) {
      requests.set(request.id, copy(request));
    },
    async updateRequest(request, expectedRevision) {
      const stored = requests.get(request.id);
      if (!stored || stored.revision !== expectedRevision) return false;
      requests.set(request.id, copy({ ...request, id: stored.id, createdAt: stored.createdAt, createdBy: stored.createdBy }));
      return true;
    },
    async breaches() {
      return newestFirst([...breaches.values()]).map(copy);
    },
    async breach(id) {
      const found = breaches.get(id);
      return found ? copy(found) : null;
    },
    async addBreach(breach) {
      breaches.set(breach.id, copy(breach));
    },
    async updateBreach(breach, expectedRevision) {
      const stored = breaches.get(breach.id);
      if (!stored || stored.revision !== expectedRevision) return false;
      breaches.set(breach.id, copy({ ...breach, id: stored.id, createdAt: stored.createdAt, createdBy: stored.createdBy }));
      return true;
    },
    async officer() {
      return officer ? copy(officer) : null;
    },
    async saveOfficer(next) {
      officer = copy(next);
    },
    async policies() {
      return [...policies].sort((a, b) => a.kind.localeCompare(b.kind) || a.version - b.version).map(copy);
    },
    async addPolicy(policy) {
      if (policies.some((held) => held.kind === policy.kind && held.version === policy.version)) return "version-taken";
      policies.push(copy(policy));
      return "added";
    },
    async runs(limit) {
      return [...runs].sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime()).slice(0, limit).map(copy);
    },
    async addRun(run) {
      runs.push(copy(run));
    },
  };
}

/** A stay as a retention test sets it up: its state, nights, notes, and when it was paid, if that's later. */
export type FixtureStay = {
  id: string;
  status: BookingStatus;
  arrive: IsoDate;
  leave: IsoDate;
  notes?: string | null;
  serviceNotes?: string | null;
  /** A payment received on this day. */
  paidOn?: IsoDate | null;
  /** A handled booking request (accepted) that became this booking. */
  requestId?: string | null;
};

export type FixtureGuest = { id: string; name: string; phone: string | null; email: string | null; notes: string | null; createdAt: Date };

/** Guests, bookings and task photos for retention tests: put in place by each store's own means, read back the same way. */
export type RetentionFixtures = {
  addGuest(guest: FixtureGuest, stays: readonly FixtureStay[]): Promise<void>;
  /** A task with photos; done at `doneAt`, or still open when it's null. */
  addTask(task: { id: string; doneAt: Date | null; photoIds: readonly string[] }): Promise<void>;
  guest(id: string): Promise<{ name: string; phone: string | null; email: string | null; notes: string | null; anonymised: boolean } | null>;
  bookingNotes(bookingId: string): Promise<{ notes: string | null; serviceNotes: string | null; cancelReason: string | null } | null>;
  taskPhotos(taskId: string): Promise<string[]>;
  fileExists(fileId: string): Promise<boolean>;
  requestExists(requestId: string): Promise<boolean>;
};

type HeldGuest = FixtureGuest & { anonymisedAt: Date | null; updatedAt: Date };
type HeldBooking = { id: string; guestId: string; status: BookingStatus; arrive: IsoDate; leave: IsoDate; notes: string | null; serviceNotes: string | null; cancelReason: string | null; paidOn: IsoDate[]; revision: number };

/** A booking as the reservations core reads it, from what a retention test holds. */
function bookingOf(held: HeldBooking, ref: string): Booking {
  const at = new Date("2026-01-01T08:00:00.000Z");
  return {
    id: held.id,
    ref,
    guestId: held.guestId,
    channel: "phone",
    status: held.status,
    apartment: "family-shower",
    unitId: "00000000-0000-4000-8000-00000000a0a1",
    stay: { arrive: held.arrive, leave: held.leave },
    adults: 2,
    children: 0,
    totalCents: 100_000,
    depositDueCents: 0,
    serviceNotes: held.serviceNotes,
    notes: held.notes,
    externalRef: null,
    requestId: null,
    createdBy: null,
    createdAt: at,
    updatedAt: at,
    revision: held.revision,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancelReason: held.cancelReason,
  };
}

/**
 * Guests, bookings, booking requests and task photos in memory, with the
 * retention store over them and the guest records the reservations core
 * would give (so anonymising shows in what's read back).
 */
export function createMemoryRetention(): { retention: RetentionStore; guests: GuestRecords; fixtures: RetentionFixtures } {
  const guests = new Map<string, HeldGuest>();
  const bookings = new Map<string, HeldBooking>();
  const requests = new Map<string, { bookingId: string }>();
  const tasks = new Map<string, { doneAt: Date | null; photoIds: string[] }>();
  const files = new Set<string>();

  const bookingsOf = (guestId: string) => [...bookings.values()].filter((booking) => booking.guestId === guestId);
  const busy = (guestId: string) => bookingsOf(guestId).some((booking) => (activeStayStatuses as readonly string[]).includes(booking.status));
  const lastActive = (guest: HeldGuest): IsoDate =>
    [zonedToday(guest.createdAt, businessTimeZone), ...bookingsOf(guest.id).flatMap((booking) => [booking.leave, ...booking.paidOn])].sort(compareIsoDates).at(-1)!;
  const inactive = (before: IsoDate) => [...guests.values()].filter((guest) => !guest.anonymisedAt && !busy(guest.id) && compareIsoDates(lastActive(guest), before) < 0);
  const guestOf = (held: HeldGuest): Guest => ({ id: held.id, name: held.name, phone: held.phone, email: held.email, notes: held.notes, createdAt: held.createdAt, updatedAt: held.updatedAt });

  function anonymise(guest: HeldGuest, at: Date): number {
    guests.set(guest.id, { ...guest, name: anonymisedGuestName, phone: null, email: null, notes: null, anonymisedAt: at, updatedAt: at });
    let cleared = 0;
    for (const booking of bookingsOf(guest.id)) {
      if (booking.notes === null && booking.serviceNotes === null && booking.cancelReason === null) continue;
      bookings.set(booking.id, { ...booking, notes: null, serviceNotes: null, cancelReason: null, revision: booking.revision + 1 });
      cleared += 1;
    }
    return cleared;
  }

  const photosDoneBefore = (doneBefore: Date) => [...tasks.values()].filter((task) => task.doneAt !== null && task.doneAt < doneBefore);

  const retention: RetentionStore = {
    async countInactiveGuests(before) {
      return inactive(before).length;
    },
    async anonymiseInactiveGuests(before, at) {
      const found = inactive(before);
      for (const guest of found) anonymise(guest, at);
      return found.length;
    },
    async countTaskPhotos(doneBefore) {
      return photosDoneBefore(doneBefore).reduce((sum, task) => sum + task.photoIds.length, 0);
    },
    async deleteTaskPhotos(doneBefore) {
      let deleted = 0;
      for (const task of photosDoneBefore(doneBefore)) {
        for (const id of task.photoIds) {
          files.delete(id);
          deleted += 1;
        }
        task.photoIds = [];
      }
      return deleted;
    },
    async anonymiseGuest(guestId, at): Promise<GuestAnonymising> {
      const guest = guests.get(guestId);
      if (!guest) return { status: "missing" };
      if (guest.anonymisedAt) return { status: "already" };
      if (busy(guestId)) return { status: "active-stay" };
      const bookingIds = new Set(bookingsOf(guestId).map((booking) => booking.id));
      const bookingsCleared = anonymise(guest, at);
      let requestsDeleted = 0;
      for (const [id, request] of requests) {
        if (!bookingIds.has(request.bookingId)) continue;
        requests.delete(id);
        requestsDeleted += 1;
      }
      return { status: "anonymised", bookingsCleared, requestsDeleted };
    },
    async anonymisedAt(guestId) {
      return guests.get(guestId)?.anonymisedAt ?? null;
    },
  };

  const records: GuestRecords = {
    async searchGuests(query, limit) {
      const needle = query.toLowerCase();
      return [...guests.values()]
        .filter((guest) => [guest.name, guest.phone, guest.email].some((value) => value?.toLowerCase().includes(needle)))
        .slice(0, limit)
        .map(guestOf);
    },
    async guest(id) {
      const held = guests.get(id);
      return held ? guestOf(held) : null;
    },
    async bookingsForGuest(guestId) {
      return bookingsOf(guestId)
        .sort((a, b) => compareIsoDates(b.arrive, a.arrive))
        .map((booking, index) => bookingOf(booking, `RG-M${String.fromCharCode(65 + (index % 8))}2C3`));
    },
  };

  const fixtures: RetentionFixtures = {
    async addGuest(guest, stays) {
      guests.set(guest.id, { ...guest, anonymisedAt: null, updatedAt: guest.createdAt });
      for (const stay of stays) {
        bookings.set(stay.id, {
          id: stay.id,
          guestId: guest.id,
          status: stay.status,
          arrive: stay.arrive,
          leave: stay.leave,
          notes: stay.notes ?? null,
          serviceNotes: stay.serviceNotes ?? null,
          cancelReason: stay.status === "cancelled" ? "Plans changed" : null,
          paidOn: stay.paidOn ? [stay.paidOn] : [],
          revision: 1,
        });
        if (stay.requestId) requests.set(stay.requestId, { bookingId: stay.id });
      }
    },
    async addTask(task) {
      tasks.set(task.id, { doneAt: task.doneAt, photoIds: [...task.photoIds] });
      for (const id of task.photoIds) files.add(id);
    },
    async guest(id) {
      const held = guests.get(id);
      return held ? { name: held.name, phone: held.phone, email: held.email, notes: held.notes, anonymised: held.anonymisedAt !== null } : null;
    },
    async bookingNotes(bookingId) {
      const held = bookings.get(bookingId);
      return held ? { notes: held.notes, serviceNotes: held.serviceNotes, cancelReason: held.cancelReason } : null;
    },
    async taskPhotos(taskId) {
      return [...(tasks.get(taskId)?.photoIds ?? [])].sort();
    },
    async fileExists(fileId) {
      return files.has(fileId);
    },
    async requestExists(requestId) {
      return requests.has(requestId);
    },
  };

  return { retention, guests: records, fixtures };
}
