import type { PrivacyStore, RetentionStore } from "../ports";
import { anonymisedGuestName, type Breach, type DataSubjectRequest } from "../privacy";
import type { RetentionPolicy } from "../retention";
import type { FixtureGuest, RetentionFixtures } from "./memory-stores";

/**
 * What every privacy store must do, as cases run against fresh, empty
 * stores (Postgres checks its constraints; memory follows the same rules):
 *
 *   for (const { name, run } of privacyStoreContract) it(name, async () => run(emptyPrivacyStore()));
 *   for (const { name, run } of retentionStoreContract) it(name, async () => run(await emptyRetention()));
 */
export type PrivacyStoreCase = { name: string; run: (store: PrivacyStore) => Promise<void> };
export type RetentionStoreCase = { name: string; run: (stores: { retention: RetentionStore; fixtures: RetentionFixtures }) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

let counter = 0;
const nextId = (prefix: string) => `00000000-0000-4000-8000-${prefix}${String((counter += 1)).padStart(12 - prefix.length, "0")}`;

export function testRequest(fields: Partial<DataSubjectRequest> = {}): DataSubjectRequest {
  return {
    id: nextId("5e"),
    kind: "access",
    requesterName: "Thandi Mokoena",
    contactSealed: "v1.sealed-contact",
    contactHint: "t•••@example.com",
    receivedOn: "2026-11-10",
    dueOn: "2026-12-10",
    status: "received",
    details: "Asked what we hold about her.",
    notes: null,
    guestId: null,
    identityConfirmedOn: null,
    identityNote: null,
    closedOn: null,
    outcome: null,
    createdBy: ownerId,
    createdAt: at,
    updatedAt: at,
    revision: 1,
    ...fields,
  };
}

export function testBreach(fields: Partial<Breach> = {}): Breach {
  return {
    id: nextId("b7"),
    discoveredOn: "2026-11-11",
    summary: "The reception laptop was stolen from the car.",
    dataInvolved: "Guests' names and phone numbers in a spreadsheet.",
    peopleAffected: 40,
    status: "ongoing",
    containedOn: null,
    regulatorToldOn: null,
    regulatorReference: null,
    peopleToldOn: null,
    peopleToldHow: null,
    actions: null,
    createdBy: ownerId,
    createdAt: at,
    updatedAt: at,
    revision: 1,
    ...fields,
  };
}

export function testPolicy(fields: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return { id: nextId("90"), kind: "task-photos", version: 1, period: 12, setBy: ownerId, setByName: "Nico", setAt: at, ...fields };
}

export const privacyStoreContract: readonly PrivacyStoreCase[] = [
  {
    name: "stores requests, reads them back exactly (newest first), and changes one only over the revision it was read at",
    async run(store) {
      const first = testRequest();
      const second = testRequest({ kind: "deletion", contactSealed: null, contactHint: null, details: null, createdAt: later, updatedAt: later });
      await store.addRequest(first);
      await store.addRequest(second);
      expectSame(await store.request(first.id), first, "read back");
      expectSame((await store.requests()).map((request) => request.id), [second.id, first.id], "newest first");
      expectSame(await store.request("00000000-0000-4000-8000-000000000bad"), null, "missing");
      expectSame(await store.request("not-a-uuid"), null, "not an id");

      const answered: DataSubjectRequest = { ...first, status: "answered", closedOn: "2026-11-12", outcome: "Sent her the export.", guestId: null, revision: 2, updatedAt: later };
      expectSame(await store.updateRequest(answered, 1), true, "update");
      expectSame(await store.request(first.id), answered, "updated");
      expectSame(await store.updateRequest({ ...answered, notes: "late", revision: 3 }, 1), false, "stale revision");
      expectSame((await store.request(first.id))?.notes, null, "stale change not kept");
      expectSame(await store.updateRequest(testRequest({ revision: 2 }), 1), false, "missing request");
    },
  },
  {
    name: "stores breaches, reads them back exactly (newest first), and changes one only over the revision it was read at",
    async run(store) {
      const first = testBreach();
      const second = testBreach({ peopleAffected: null, createdAt: later, updatedAt: later });
      await store.addBreach(first);
      await store.addBreach(second);
      expectSame(await store.breach(first.id), first, "read back");
      expectSame((await store.breaches()).map((breach) => breach.id), [second.id, first.id], "newest first");
      expectSame(await store.breach("not-a-uuid"), null, "not an id");
      const contained: Breach = {
        ...first,
        status: "contained",
        containedOn: "2026-11-12",
        regulatorToldOn: "2026-11-12",
        regulatorReference: "SCN-2026-001",
        peopleToldOn: "2026-11-12",
        peopleToldHow: "Email to each guest",
        actions: "Passwords changed.",
        revision: 2,
        updatedAt: later,
      };
      expectSame(await store.updateBreach(contained, 1), true, "update");
      expectSame(await store.breach(first.id), contained, "updated");
      expectSame(await store.updateBreach({ ...contained, revision: 3 }, 1), false, "stale revision");
    },
  },
  {
    name: "keeps one set of Information Officer details, replaced as a whole",
    async run(store) {
      expectSame(await store.officer(), null, "none yet");
      const officer = { name: "Nico Pretorius", email: "privacy@example.com", phone: "+27821234567", registrationReference: null, updatedAt: at, updatedBy: ownerId };
      await store.saveOfficer(officer);
      expectSame(await store.officer(), officer, "saved");
      const changed = { ...officer, phone: null, registrationReference: "IO-12345", updatedAt: later };
      await store.saveOfficer(changed);
      expectSame(await store.officer(), changed, "replaced");
    },
  },
  {
    name: "keeps every retention policy version, refusing a version a kind already has",
    async run(store) {
      const photos = testPolicy();
      const guests = testPolicy({ kind: "guest-records", period: 7 });
      const confirmed = testPolicy({ kind: "audit-log", period: null });
      const photosAgain = testPolicy({ version: 2, period: 6, setAt: later });
      for (const policy of [photos, guests, confirmed, photosAgain]) expectSame(await store.addPolicy(policy), "added", `add ${policy.kind} ${policy.version}`);
      expectSame(await store.addPolicy(testPolicy({ version: 2, period: 3 })), "version-taken", "same version");
      expectSame(await store.policies(), [confirmed, guests, photos, photosAgain], "all versions, by kind and version");
    },
  },
  {
    name: "keeps every retention run, newest first",
    async run(store) {
      const first = { id: nextId("40"), ranAt: at, guestsAnonymised: 0, photosDeleted: 3, skipped: ["Guest records: Waiting for you to confirm the period."] };
      const second = { id: nextId("40"), ranAt: later, guestsAnonymised: 2, photosDeleted: 0, skipped: [] };
      await store.addRun(first);
      await store.addRun(second);
      expectSame(await store.runs(10), [second, first], "newest first");
      expectSame(await store.runs(1), [second], "limited");
    },
  },
];

const guestAt = new Date("2017-03-01T08:00:00.000Z");

const guest = (id: string, fields: Partial<FixtureGuest> = {}): FixtureGuest => ({
  id,
  name: "Thandi Mokoena",
  phone: "+27821234567",
  email: "thandi@example.com",
  notes: "Prefers the ground floor.",
  createdAt: guestAt,
  ...fields,
});

const ids = {
  oldStay: "00000000-0000-4000-8000-00000000c101",
  stillBooked: "00000000-0000-4000-8000-00000000c102",
  recent: "00000000-0000-4000-8000-00000000c103",
  paidLater: "00000000-0000-4000-8000-00000000c104",
  cancelled: "00000000-0000-4000-8000-00000000c105",
  noStays: "00000000-0000-4000-8000-00000000c106",
  inHouse: "00000000-0000-4000-8000-00000000c107",
};

export const retentionStoreContract: readonly RetentionStoreCase[] = [
  {
    name: "anonymises guests with no stay or payment before the cut-off and nothing booked, once",
    async run({ retention, fixtures }) {
      await fixtures.addGuest(guest(ids.oldStay), [
        { id: "00000000-0000-4000-8000-00000000d101", status: "checked-out", arrive: "2018-03-07", leave: "2018-03-10", notes: "Paid cash", serviceNotes: "Late arrival" },
      ]);
      await fixtures.addGuest(guest(ids.stillBooked, { phone: "+27821234568" }), [
        { id: "00000000-0000-4000-8000-00000000d102", status: "checked-out", arrive: "2018-04-07", leave: "2018-04-10" },
        { id: "00000000-0000-4000-8000-00000000d103", status: "confirmed", arrive: "2027-01-07", leave: "2027-01-10" },
      ]);
      await fixtures.addGuest(guest(ids.recent, { phone: "+27821234569" }), [{ id: "00000000-0000-4000-8000-00000000d104", status: "checked-out", arrive: "2022-05-07", leave: "2022-05-10" }]);
      await fixtures.addGuest(guest(ids.paidLater, { phone: "+27821234570" }), [
        { id: "00000000-0000-4000-8000-00000000d105", status: "checked-out", arrive: "2018-06-07", leave: "2018-06-10", paidOn: "2020-01-10" },
      ]);
      await fixtures.addGuest(guest(ids.cancelled, { phone: "+27821234571" }), [{ id: "00000000-0000-4000-8000-00000000d106", status: "cancelled", arrive: "2017-07-07", leave: "2017-07-10" }]);
      await fixtures.addGuest(guest(ids.noStays, { phone: "+27821234572" }), []);
      await fixtures.addGuest(guest(ids.inHouse, { phone: "+27821234573" }), [{ id: "00000000-0000-4000-8000-00000000d107", status: "checked-in", arrive: "2018-08-07", leave: "2018-08-10" }]);

      expectSame(await retention.countInactiveGuests("2019-11-13"), 3, "count");
      expectSame(await retention.anonymiseInactiveGuests("2019-11-13", at), 3, "anonymised");
      expectSame(await fixtures.guest(ids.oldStay), { name: anonymisedGuestName, phone: null, email: null, notes: null, anonymised: true }, "old stay anonymised");
      expectSame(await fixtures.bookingNotes("00000000-0000-4000-8000-00000000d101"), { notes: null, serviceNotes: null, cancelReason: null }, "booking notes cleared");
      expectSame((await fixtures.guest(ids.cancelled))?.anonymised, true, "cancelled stay anonymised");
      expectSame((await fixtures.guest(ids.noStays))?.anonymised, true, "guest without stays anonymised");
      for (const kept of [ids.stillBooked, ids.recent, ids.paidLater, ids.inHouse]) {
        expectSame((await fixtures.guest(kept))?.name, "Thandi Mokoena", `kept ${kept}`);
      }
      expectSame(await retention.anonymisedAt(ids.oldStay), at, "anonymised at");
      expectSame(await retention.anonymisedAt(ids.recent), null, "not anonymised");
      expectSame(await retention.countInactiveGuests("2019-11-13"), 0, "nothing left");
      expectSame(await retention.anonymiseInactiveGuests("2019-11-13", later), 0, "second run");
      expectSame(await retention.anonymisedAt(ids.oldStay), at, "first time kept");
    },
  },
  {
    name: "anonymises one guest on request, refusing while a stay is booked or under way, and deletes the handled request their booking came from",
    async run({ retention, fixtures }) {
      const requestId = "00000000-0000-4000-8000-00000000e101";
      await fixtures.addGuest(guest(ids.oldStay), [
        { id: "00000000-0000-4000-8000-00000000d111", status: "checked-out", arrive: "2026-10-01", leave: "2026-10-03", notes: "Wants an invoice", requestId },
        { id: "00000000-0000-4000-8000-00000000d112", status: "no-show", arrive: "2026-10-10", leave: "2026-10-12" },
      ]);
      await fixtures.addGuest(guest(ids.inHouse, { phone: "+27821234573" }), [{ id: "00000000-0000-4000-8000-00000000d113", status: "checked-in", arrive: "2026-11-11", leave: "2026-11-14" }]);
      await fixtures.addGuest(guest(ids.stillBooked, { phone: "+27821234568" }), [{ id: "00000000-0000-4000-8000-00000000d114", status: "confirmed", arrive: "2026-12-11", leave: "2026-12-14" }]);

      expectSame(await retention.anonymiseGuest(ids.inHouse, at), { status: "active-stay" }, "in the house");
      expectSame(await retention.anonymiseGuest(ids.stillBooked, at), { status: "active-stay" }, "booked");
      expectSame((await fixtures.guest(ids.inHouse))?.anonymised, false, "unchanged");
      expectSame(await retention.anonymiseGuest(ids.oldStay, at), { status: "anonymised", bookingsCleared: 1, requestsDeleted: 1 }, "anonymised");
      expectSame(await fixtures.guest(ids.oldStay), { name: anonymisedGuestName, phone: null, email: null, notes: null, anonymised: true }, "record");
      expectSame((await fixtures.bookingNotes("00000000-0000-4000-8000-00000000d111"))?.notes, null, "booking notes cleared");
      expectSame(await fixtures.requestExists(requestId), false, "request deleted");
      expectSame(await retention.anonymiseGuest(ids.oldStay, later), { status: "already" }, "again");
      expectSame(await retention.anonymiseGuest("00000000-0000-4000-8000-00000000cfff", at), { status: "missing" }, "missing");
      expectSame(await retention.anonymiseGuest("not-a-uuid", at), { status: "missing" }, "not an id");
      expectSame(await retention.anonymisedAt("not-a-uuid"), null, "not an id has none");
    },
  },
  {
    name: "deletes the photos on tasks done before the cut-off, and only those",
    async run({ retention, fixtures }) {
      const photo = (n: number) => `00000000-0000-4000-8000-0000000f${String(n).padStart(4, "0")}`;
      const old = "00000000-0000-4000-8000-0000000e0101";
      const recent = "00000000-0000-4000-8000-0000000e0102";
      const open = "00000000-0000-4000-8000-0000000e0103";
      await fixtures.addTask({ id: old, doneAt: new Date("2025-10-01T08:00:00.000Z"), photoIds: [photo(1), photo(2)] });
      await fixtures.addTask({ id: recent, doneAt: new Date("2026-11-01T08:00:00.000Z"), photoIds: [photo(3)] });
      await fixtures.addTask({ id: open, doneAt: null, photoIds: [photo(4)] });
      const cutoff = new Date("2025-11-12T22:00:00.000Z");
      expectSame(await retention.countTaskPhotos(cutoff), 2, "count");
      expectSame(await retention.deleteTaskPhotos(cutoff), 2, "deleted");
      expectSame(await fixtures.taskPhotos(old), [], "old task has none");
      expectSame(await fixtures.fileExists(photo(1)), false, "file gone");
      expectSame(await fixtures.taskPhotos(recent), [photo(3)], "recent kept");
      expectSame(await fixtures.taskPhotos(open), [photo(4)], "open kept");
      expectSame(await fixtures.fileExists(photo(3)), true, "recent file kept");
      expectSame(await retention.deleteTaskPhotos(cutoff), 0, "second run");
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
