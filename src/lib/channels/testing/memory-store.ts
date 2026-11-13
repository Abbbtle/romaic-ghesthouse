import { memoryBlockOutcome, memoryInventoryState, type MemoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { staysOverlap } from "@/lib/inventory/stays";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { Channel, ChannelCalendar, ChannelEvent, SyncRun } from "../channels";
import type { CalendarAdd, ChannelStore, EventPlacement } from "../ports";

/** The channels a fresh database starts with (migration 250): Booking.com on, the rest off until the owner turns them on. */
export const seededChannels: readonly Channel[] = [
  { key: "booking-com", name: "Booking.com", active: true, sort: 1 },
  { key: "airbnb", name: "Airbnb", active: false, sort: 2 },
  { key: "expedia", name: "Expedia", active: false, sort: 3 },
  { key: "lekkeslaap", name: "LekkeSlaap", active: false, sort: 4 },
  { key: "safarinow", name: "SafariNow", active: false, sort: 5 },
];

/** How many runs a calendar keeps. */
export const keptRuns = 30;

const copy = <T>(value: T): T => structuredClone(value);

/**
 * Channels in memory, for tests, keeping the Postgres store's rules
 * (./store-contract.ts checks both). It shares the inventory's units and
 * blocks, so an imported stay and a booking can't both take a night.
 */
export type MemoryChannelStore = ChannelStore & {
  /**
   * What completing a placeholder as a booking does (the reservations work,
   * in Postgres): its block goes, the booking holds the nights, and the
   * stay is linked to it.
   */
  link(eventId: string, bookingId: string): void;
};

export function createMemoryChannelStore(inventory: MemoryInventoryState = memoryInventoryState()): MemoryChannelStore {
  const channels = new Map(seededChannels.map((channel) => [channel.key, { ...channel }]));
  const calendars = new Map<string, ChannelCalendar>();
  const sealed = new Map<string, string>();
  const events = new Map<string, ChannelEvent>();
  const runs: SyncRun[] = [];
  const feeds = new Map<string, { tokenHash: string; sealedToken: string; createdAt: Date }>();

  const blockOfEvent = (eventId: string) => [...inventory.blocks.values()].find((block) => block.channelEventId === eventId);
  const dropBlockOf = (eventId: string) => {
    const block = blockOfEvent(eventId);
    if (block) inventory.blocks.delete(block.id);
  };
  function place(block: AvailabilityBlock): EventPlacement {
    const outcome = memoryBlockOutcome(inventory, block);
    if (outcome.status === "added") {
      inventory.blocks.set(block.id, copy(block));
      return { status: "placed" };
    }
    return { status: "conflict", reason: outcome.status === "overlaps" ? "taken" : "unit-unavailable" };
  }
  const conflictNote = (placement: EventPlacement) =>
    placement.status === "conflict" ? (placement.reason === "taken" ? "The unit is already taken on one of these nights." : "The unit isn't offered.") : null;

  return {
    link(eventId, bookingId) {
      const event = events.get(eventId);
      if (!event) throw new Error(`No imported stay ${eventId}`);
      dropBlockOf(eventId);
      events.set(eventId, { ...event, status: "linked", bookingId, note: null });
    },
    async channels() {
      return [...channels.values()].sort((a, b) => a.sort - b.sort).map(copy);
    },
    async updateChannel(key, changes) {
      const channel = channels.get(key);
      if (!channel) return false;
      channels.set(key, { ...channel, ...changes });
      return true;
    },
    async calendars() {
      return [...calendars.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(copy);
    },
    async calendar(id) {
      const calendar = calendars.get(id);
      return calendar ? copy(calendar) : null;
    },
    async sealedUrl(id) {
      return sealed.get(id) ?? null;
    },
    async addCalendar(calendar, sealedUrl): Promise<CalendarAdd> {
      if (!inventory.units.has(calendar.unitId)) return { status: "unit-missing" };
      if (!channels.has(calendar.channel)) return { status: "channel-missing" };
      if ([...calendars.values()].some((other) => other.unitId === calendar.unitId && other.channel === calendar.channel)) return { status: "duplicate" };
      calendars.set(calendar.id, copy(calendar));
      sealed.set(calendar.id, sealedUrl);
      return { status: "added" };
    },
    async changeCalendarUrl(id, sealedUrl, host) {
      const calendar = calendars.get(id);
      if (!calendar) return false;
      calendars.set(id, { ...calendar, host, etag: null, lastModified: null });
      sealed.set(id, sealedUrl);
      return true;
    },
    async removeCalendar(id) {
      if (!calendars.delete(id)) return false;
      sealed.delete(id);
      for (const [eventId, event] of events) {
        if (event.calendarId !== id) continue;
        dropBlockOf(eventId);
        events.delete(eventId);
      }
      for (let index = runs.length - 1; index >= 0; index -= 1) if (runs[index]!.calendarId === id) runs.splice(index, 1);
      return true;
    },
    async recordSync(record) {
      const calendar = calendars.get(record.calendarId);
      if (!calendar) return;
      calendars.set(calendar.id, { ...calendar, lastSyncedAt: record.at, lastStatus: record.status, lastError: record.error, etag: record.etag, lastModified: record.lastModified });
      runs.push(copy(record.run));
      const own = runs.filter((run) => run.calendarId === calendar.id).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      for (const old of own.slice(keptRuns)) runs.splice(runs.indexOf(old), 1);
    },
    async recentRuns(calendarId, limit) {
      return runs
        .filter((run) => run.calendarId === calendarId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit)
        .map(copy);
    },
    async events(calendarId) {
      return [...events.values()].filter((event) => event.calendarId === calendarId).sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive)).map(copy);
    },
    async attention() {
      return [...events.values()]
        .filter((event) => event.status === "conflict" || event.status === "gone" || (event.status === "linked" && event.note !== null))
        .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive))
        .map(copy);
    },
    async addEvent(event, block) {
      const placement = place(block);
      events.set(event.id, { ...copy(event), status: placement.status === "placed" ? "placeholder" : "conflict", note: conflictNote(placement) });
      return placement;
    },
    async moveEvent(eventId, stay, block, seenAt) {
      const event = events.get(eventId);
      if (!event) return { status: "conflict", reason: "unit-unavailable" };
      const previous = blockOfEvent(eventId);
      if (previous) inventory.blocks.delete(previous.id);
      const placement = place(block);
      events.set(eventId, { ...event, stay: { ...stay }, status: placement.status === "placed" ? "placeholder" : "conflict", note: conflictNote(placement), lastSeen: seenAt });
      return placement;
    },
    async markEvent(eventId, changes) {
      const event = events.get(eventId);
      if (!event) return false;
      events.set(eventId, { ...event, status: changes.status, note: changes.note, stay: { ...changes.stay }, lastSeen: changes.seenAt });
      return true;
    },
    async removeEvent(eventId) {
      if (!events.has(eventId)) return false;
      dropBlockOf(eventId);
      events.delete(eventId);
      return true;
    },
    async unitFeed(unitId) {
      const feed = feeds.get(unitId);
      return feed ? { sealedToken: feed.sealedToken, createdAt: feed.createdAt } : null;
    },
    async setUnitFeed(unitId, tokenHash, sealedToken, at) {
      if (!inventory.units.has(unitId)) return false;
      feeds.set(unitId, { tokenHash, sealedToken, createdAt: at });
      return true;
    },
    async unitForFeed(tokenHash) {
      return [...feeds.entries()].find(([, feed]) => feed.tokenHash === tokenHash)?.[0] ?? null;
    },
    async feedBlocks(unitId, range) {
      return [...inventory.blocks.values()]
        .filter((block) => block.unitId === unitId && staysOverlap(block.stay, range))
        .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive))
        .map((block) => {
          const event = block.channelEventId ? events.get(block.channelEventId) : undefined;
          const calendar = event ? calendars.get(event.calendarId) : undefined;
          return { block: copy(block), channel: calendar?.channel ?? null };
        });
    },
  };
}
