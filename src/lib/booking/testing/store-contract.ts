import type { InventoryStore } from "@/lib/inventory/ports";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import type { BookingStore } from "../ports";
import { requestRefAlphabet, requestRefPrefix } from "../reference-codes";
import type { BookingRequest } from "../requests";

/**
 * What every BookingStore must do, with the InventoryStore over the same
 * data (accepting writes a block), as cases a test file runs on a fresh,
 * empty pair:
 *
 *   for (const { name, run } of bookingStoreContract) it(name, async () => run(await emptyStores()));
 *
 * The memory stores run it under `npm test`; the Postgres stores run it on
 * PGlite and on a real server.
 */
export type BookingStores = { requests: BookingStore; inventory: InventoryStore };

export type BookingStoreCase = { name: string; run: (stores: BookingStores) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const unitA = "00000000-0000-4000-8000-00000000a0a1";
const today = "2026-11-12";
const sentAt = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:30:00.000Z");

let counter = 0;

/** A valid, distinct reference code for the nth test request. */
function refFor(n: number): string {
  let code = "";
  for (let rest = n, place = 0; place < 5; place += 1, rest = Math.floor(rest / requestRefAlphabet.length)) {
    code = requestRefAlphabet.charAt(rest % requestRefAlphabet.length) + code;
  }
  return `${requestRefPrefix}${code}`;
}

/** A waiting request, with whatever's given in place of the defaults. Ids are UUIDs, as Postgres needs. */
export function testRequest(fields: Partial<BookingRequest> = {}): BookingRequest {
  counter += 1;
  const n = String(counter).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${n}`,
    ref: refFor(counter),
    apartment: "family-shower",
    apartmentName: "Family apartment with shower",
    stay: { arrive: "2026-12-10", leave: "2026-12-13" },
    adults: 2,
    children: 1,
    name: "Thandi Mokoena",
    phone: "+27821234567",
    email: "thandi@example.com",
    arrivalTime: "About 18:00",
    notes: null,
    consent: { at: sentAt, consentVersion: "0.1", noticeVersion: "0.1" },
    status: "waiting",
    visitorKey: "visitor-key",
    createdAt: sentAt,
    decision: null,
    ...fields,
  };
}

const rules = { maxWaitingPerPhone: 3, today };

export const bookingStoreContract: readonly BookingStoreCase[] = [
  {
    name: "stores a request and reads it back exactly",
    async run({ requests }) {
      const request = testRequest({ notes: "Late arrival, about 22:00." });
      expectSame(await requests.create(request, rules), { status: "created" }, "create");
      expectSame(await requests.request(request.id), request, "read back");
      expectSame(await requests.waitingCount(today), 1, "count");
    },
  },
  {
    name: "refuses a reference code that's in use, a duplicate from one phone, and a fourth waiting request",
    async run({ requests }) {
      const first = testRequest();
      await requests.create(first, rules);
      expectSame(await requests.create(testRequest({ ref: first.ref, phone: "+27831112222" }), rules), { status: "ref-taken" }, "same ref");
      expectSame(await requests.create(testRequest({ stay: { arrive: "2026-12-12", leave: "2026-12-14" } }), rules), { status: "duplicate" }, "shares a night");
      expectSame(await requests.create(testRequest({ apartment: "deluxe-double-bath" }), rules), { status: "created" }, "another apartment");
      expectSame(await requests.create(testRequest({ stay: { arrive: "2026-12-13", leave: "2026-12-15" } }), rules), { status: "created" }, "back to back");
      expectSame(await requests.create(testRequest({ stay: { arrive: "2027-01-10", leave: "2027-01-12" } }), rules), { status: "too-many-waiting" }, "fourth");
      expectSame(
        await requests.create(testRequest({ phone: "+27831112222", stay: { arrive: "2027-01-10", leave: "2027-01-12" } }), rules),
        { status: "created" },
        "another phone",
      );
    },
  },
  {
    name: "lists waiting requests by arrival, and counts a past arrival as no longer waiting",
    async run({ requests }) {
      const soon = testRequest({ stay: { arrive: "2026-11-20", leave: "2026-11-21" }, phone: "+27830000001" });
      const later1 = testRequest({ stay: { arrive: "2026-12-20", leave: "2026-12-21" }, phone: "+27830000002" });
      const past = testRequest({ stay: { arrive: "2026-11-10", leave: "2026-11-11" }, phone: "+27830000003" });
      for (const request of [later1, past, soon]) await requests.create(request, { ...rules, today: "2026-11-01" });
      expectSame((await requests.waiting(today, 10)).map((request) => request.id), [soon.id, later1.id], "waiting");
      expectSame((await requests.waiting(today, 1)).map((request) => request.id), [soon.id], "the first one only");
      expectSame((await requests.handled(today, 10)).map((request) => request.id), [past.id], "handled");
      expectSame(await requests.waitingCount(today), 2, "count");
    },
  },
  {
    name: "declines only a request that's still waiting",
    async run({ requests }) {
      const request = testRequest();
      await requests.create(request, rules);
      expectSame(await requests.decline({ requestId: request.id, at: later, by: ownerId, note: "Full that week", today }), true, "decline");
      expectSame((await requests.request(request.id))?.decision, { at: later, by: ownerId, note: "Full that week", bookingId: null }, "decision");
      expectSame(await requests.decline({ requestId: request.id, at: later, by: ownerId, note: null, today }), false, "again");
      const expired = testRequest({ stay: { arrive: "2026-11-10", leave: "2026-11-11" }, phone: "+27830000009" });
      await requests.create(expired, { ...rules, today: "2026-11-01" });
      expectSame(await requests.decline({ requestId: expired.id, at: later, by: ownerId, note: null, today }), false, "past arrival");
    },
  },
  {
    name: "expires, deletes after the retention period, and forgets visitor keys",
    async run({ requests, inventory }) {
      await inventory.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
      const old = new Date("2026-07-01T08:00:00.000Z");
      const expiring = testRequest({ stay: { arrive: "2026-11-11", leave: "2026-11-12" }, phone: "+27830000011", createdAt: new Date("2026-11-10T08:00:00.000Z") });
      const oldDeclined = testRequest({ phone: "+27830000012", createdAt: old, consent: { at: old, consentVersion: "0.1", noticeVersion: "0.1" } });
      // Accepted long ago (the reservations core accepts requests; here it's stored that way).
      const oldAccepted = testRequest({
        phone: "+27830000013",
        stay: { arrive: "2026-07-10", leave: "2026-07-12" },
        createdAt: old,
        status: "accepted",
        decision: { at: old, by: ownerId, note: null, bookingId: null },
      });
      const fresh = testRequest({ phone: "+27830000014" });
      for (const request of [expiring, oldDeclined, oldAccepted, fresh]) await requests.create(request, { ...rules, today: "2026-07-01" });
      await requests.decline({ requestId: oldDeclined.id, at: old, by: ownerId, note: null, today: "2026-07-01" });
      // A Phase 2 request block still pointing at it, which deleting the request must unlink.
      await inventory.addBlock({ ...testBlock("00000000-0000-4000-8000-0000000b0001", unitA, "2026-07-10", "2026-07-12", "request"), requestId: oldAccepted.id });

      const report = await requests.housekeeping({
        expireArrivingBefore: today,
        now: later,
        deleteDecidedBefore: new Date("2026-08-14T00:00:00.000Z"),
        deleteAcceptedLeavingBefore: "2026-08-14",
        forgetVisitorKeysBefore: new Date("2026-11-11T09:30:00.000Z"),
      });
      expectSame(report, { expired: 1, deleted: 2, visitorKeysForgotten: 1 }, "report");
      expectSame((await requests.request(expiring.id))?.status, "expired", "expired");
      expectSame((await requests.request(expiring.id))?.decision, { at: later, by: null, note: null, bookingId: null }, "expired decision");
      expectSame(await requests.request(oldDeclined.id), null, "old declined deleted");
      expectSame(await requests.request(oldAccepted.id), null, "old accepted deleted");
      expectSame((await inventory.blocksOverlapping({ arrive: "2026-07-01", leave: "2026-08-01" })).map((stored) => stored.requestId), [null], "block kept, unlinked");
      expectSame((await requests.request(fresh.id))?.visitorKey, "visitor-key", "fresh key kept");
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
