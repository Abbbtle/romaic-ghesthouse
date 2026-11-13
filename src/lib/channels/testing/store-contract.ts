import type { InventoryStore } from "@/lib/inventory/ports";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { ChannelCalendar, ChannelEvent, SyncRun } from "../channels";
import type { ChannelStore } from "../ports";

/**
 * What every ChannelStore must do, with the InventoryStore over the same
 * data, as cases run on a fresh, empty pair:
 *
 *   for (const { name, run } of channelStoreContract) it(name, async () => run(await emptyStores()));
 */
export type ChannelStores = { channels: ChannelStore; inventory: InventoryStore };

export type ChannelStoreCase = { name: string; run: (stores: ChannelStores) => Promise<void> };

const unitA = "00000000-0000-4000-8000-00000000a0a1";
const unitB = "00000000-0000-4000-8000-00000000a0b2";
const calendar1 = "00000000-0000-4000-8000-00000000e001";
const calendar2 = "00000000-0000-4000-8000-00000000e002";
const event1 = "00000000-0000-4000-8000-00000000f001";
const event2 = "00000000-0000-4000-8000-00000000f002";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

export function testCalendar(id: string, unitId = unitA, channel = "booking-com"): ChannelCalendar {
  return { id, unitId, channel, host: "admin.booking.com", lastSyncedAt: null, lastStatus: "never", lastError: null, etag: null, lastModified: null, createdBy: null, createdAt: at };
}

export function testEvent(id: string, calendarId: string, arrive: string, leave: string, uid = `${id}@booking.com`): ChannelEvent {
  return { id, calendarId, uid, stay: { arrive, leave }, status: "placeholder", bookingId: null, note: null, firstSeen: at, lastSeen: at };
}

export function channelBlockFor(event: ChannelEvent, unitId: string, id: string): AvailabilityBlock {
  return { ...testBlock(id, unitId, event.stay.arrive, event.stay.leave, "channel"), channelEventId: event.id, createdBy: null };
}

function testRun(id: string, calendarId: string, startedAt: Date): SyncRun {
  return { id, calendarId, startedAt, finishedAt: startedAt, outcome: "ok", added: 1, changed: 0, removed: 0, conflicts: 0, error: null };
}

async function withUnits(inventory: InventoryStore) {
  await inventory.addUnit(testUnit(unitA, "Unit 1"), { maxUnits: 10 });
  await inventory.addUnit(testUnit(unitB, "Unit 2"), { maxUnits: 10 });
}

const block = (n: number) => `00000000-0000-4000-8000-0000000b${String(n).padStart(4, "0")}`;

export const channelStoreContract: readonly ChannelStoreCase[] = [
  {
    name: "starts with the five channels, Booking.com on, and changes their names and switches",
    async run({ channels }) {
      expectSame(
        (await channels.channels()).map((channel) => [channel.key, channel.active]),
        [["booking-com", true], ["airbnb", false], ["expedia", false], ["lekkeslaap", false], ["safarinow", false]],
        "seeded",
      );
      expectSame(await channels.updateChannel("airbnb", { name: "Airbnb ZA", active: true }), true, "update");
      expectSame((await channels.channels())[1], { key: "airbnb", name: "Airbnb ZA", active: true, sort: 2 }, "updated");
      expectSame(await channels.updateChannel("nowhere", { name: "X", active: true }), false, "missing");
    },
  },
  {
    name: "keeps one calendar per unit and channel, with its sealed link, and a new link forgets the last fetch",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      expectSame(await channels.addCalendar(testCalendar(calendar1), "sealed-1"), { status: "added" }, "add");
      expectSame(await channels.addCalendar(testCalendar(calendar2), "sealed-2"), { status: "duplicate" }, "same unit and channel");
      expectSame(await channels.addCalendar(testCalendar(calendar2, "00000000-0000-4000-8000-00000000a0ff"), "s"), { status: "unit-missing" }, "unit");
      expectSame(await channels.addCalendar(testCalendar(calendar2, unitB, "nowhere"), "s"), { status: "channel-missing" }, "channel");
      expectSame(await channels.addCalendar(testCalendar(calendar2, unitB), "sealed-2"), { status: "added" }, "other unit");
      expectSame(await channels.sealedUrl(calendar1), "sealed-1", "sealed link");
      const run = testRun("00000000-0000-4000-8000-000000000901", calendar1, later);
      await channels.recordSync({ calendarId: calendar1, at: later, status: "ok", error: null, etag: '"v1"', lastModified: "Thu, 12 Nov 2026 07:00:00 GMT", run });
      expectSame([(await channels.calendar(calendar1))?.etag, (await channels.calendar(calendar1))?.lastStatus], ['"v1"', "ok"], "recorded");
      expectSame(await channels.changeCalendarUrl(calendar1, "sealed-new", "ical.booking.com"), true, "change");
      const changed = await channels.calendar(calendar1);
      expectSame([changed?.host, changed?.etag, changed?.lastModified, await channels.sealedUrl(calendar1)], ["ical.booking.com", null, null, "sealed-new"], "changed");
    },
  },
  {
    name: "places an imported stay with its block, or stores it as a conflict when the unit is taken or not offered",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      await channels.addCalendar(testCalendar(calendar1), "s");
      const first = testEvent(event1, calendar1, "2026-12-10", "2026-12-13");
      expectSame(await channels.addEvent(first, channelBlockFor(first, unitA, block(1))), { status: "placed" }, "placed");
      expectSame((await inventory.blocksOverlapping(first.stay)).map((stored) => [stored.reason, stored.channelEventId]), [["channel", event1]], "block");
      const clash = testEvent(event2, calendar1, "2026-12-12", "2026-12-14");
      expectSame(await channels.addEvent(clash, channelBlockFor(clash, unitA, block(2))), { status: "conflict", reason: "taken" }, "taken");
      const stored = await channels.events(calendar1);
      expectSame(stored.map((event) => [event.id, event.status]), [[event1, "placeholder"], [event2, "conflict"]], "statuses");
      expectSame((await channels.attention()).map((event) => event.id), [event2], "the conflict needs attention");
    },
  },
  {
    name: "moves a stay's block with its dates, turning it into a conflict when the new nights are taken, and back",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      await channels.addCalendar(testCalendar(calendar1), "s");
      const event = testEvent(event1, calendar1, "2026-12-10", "2026-12-13");
      await channels.addEvent(event, channelBlockFor(event, unitA, block(1)));
      await inventory.addBlock(testBlock(block(9), unitA, "2026-12-20", "2026-12-22"));
      const moved = { ...event, stay: { arrive: "2026-12-14", leave: "2026-12-16" } };
      expectSame(await channels.moveEvent(event1, moved.stay, channelBlockFor(moved, unitA, block(2)), later), { status: "placed" }, "moved");
      expectSame((await inventory.blocksOverlapping({ arrive: "2026-12-01", leave: "2026-12-31" })).map((stored) => stored.id).sort(), [block(2), block(9)].sort(), "old block gone");
      const clash = { ...event, stay: { arrive: "2026-12-21", leave: "2026-12-23" } };
      expectSame(await channels.moveEvent(event1, clash.stay, channelBlockFor(clash, unitA, block(3)), later), { status: "conflict", reason: "taken" }, "taken");
      expectSame((await channels.events(calendar1))[0]?.status, "conflict", "conflict");
      expectSame((await inventory.blocksOverlapping({ arrive: "2026-12-01", leave: "2026-12-31" })).map((stored) => stored.id), [block(9)], "it holds nothing");
      const free = { ...event, stay: { arrive: "2026-12-24", leave: "2026-12-26" } };
      expectSame(await channels.moveEvent(event1, free.stay, channelBlockFor(free, unitA, block(4)), later), { status: "placed" }, "free again");
      expectSame((await channels.events(calendar1))[0]?.status, "placeholder", "placeholder again");
    },
  },
  {
    name: "marks linked stays without touching blocks, and removes a stay or a calendar with their blocks",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      await channels.addCalendar(testCalendar(calendar1), "s");
      const event = testEvent(event1, calendar1, "2026-12-10", "2026-12-13");
      await channels.addEvent(event, channelBlockFor(event, unitA, block(1)));
      expectSame(await channels.markEvent(event1, { status: "gone", note: "No longer on Booking.com's calendar.", stay: event.stay, seenAt: later }), true, "mark");
      expectSame((await inventory.blocksOverlapping(event.stay)).length, 1, "block untouched");
      expectSame((await channels.attention()).map((stored) => [stored.id, stored.status]), [[event1, "gone"]], "gone needs attention");
      expectSame(await channels.removeEvent(event1), true, "remove");
      expectSame(await inventory.blocksOverlapping(event.stay), [], "block removed");
      const other = testEvent(event2, calendar1, "2026-12-20", "2026-12-22");
      await channels.addEvent(other, channelBlockFor(other, unitA, block(2)));
      expectSame(await channels.removeCalendar(calendar1), true, "remove calendar");
      expectSame([await channels.calendar(calendar1), await channels.events(calendar1), await inventory.blocksOverlapping(other.stay)], [null, [], []], "all gone");
    },
  },
  {
    name: "keeps the most recent runs per calendar, newest first",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      await channels.addCalendar(testCalendar(calendar1), "s");
      for (let index = 0; index < 32; index += 1) {
        const startedAt = new Date(at.getTime() + index * 60_000);
        const run = testRun(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, calendar1, startedAt);
        await channels.recordSync({ calendarId: calendar1, at: startedAt, status: "ok", error: null, etag: null, lastModified: null, run });
      }
      const recent = await channels.recentRuns(calendar1, 100);
      expectSame(recent.length, 30, "kept");
      expectSame(recent[0]?.id, "00000000-0000-4000-8000-000000000032", "newest first");
    },
  },
  {
    name: "finds a unit by its feed token's hash, replaces the token, and says which channel each block came from",
    async run({ channels, inventory }) {
      await withUnits(inventory);
      const hashA = "a".repeat(64);
      const hashB = "b".repeat(64);
      expectSame(await channels.setUnitFeed(unitA, hashA, "sealed-token", at), true, "set");
      expectSame([await channels.unitForFeed(hashA), (await channels.unitFeed(unitA))?.sealedToken], [unitA, "sealed-token"], "found");
      await channels.setUnitFeed(unitA, hashB, "sealed-new", later);
      expectSame([await channels.unitForFeed(hashA), await channels.unitForFeed(hashB)], [null, unitA], "replaced");
      await channels.addCalendar(testCalendar(calendar1), "s");
      const event = testEvent(event1, calendar1, "2026-12-10", "2026-12-13");
      await channels.addEvent(event, channelBlockFor(event, unitA, block(1)));
      await inventory.addBlock(testBlock(block(2), unitA, "2026-12-20", "2026-12-22", "maintenance"));
      await inventory.addBlock(testBlock(block(3), unitB, "2026-12-20", "2026-12-22"));
      const feed = await channels.feedBlocks(unitA, { arrive: "2026-12-01", leave: "2027-01-01" });
      expectSame(feed.map(({ block: stored, channel }) => [stored.id, channel]), [[block(1), "booking-com"], [block(2), null]], "unit A's blocks");
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
