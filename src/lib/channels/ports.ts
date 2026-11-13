import type { Stay } from "@/lib/inventory/stays";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { Channel, ChannelCalendar, ChannelEvent, EventStatus, SyncRun } from "./channels";

/**
 * What the channels core needs from the outside world. Adapters implement
 * these (Postgres, HTTP, the field cipher); in-memory ones in ./testing
 * behave the same way. Every write is one atomic command, and a block's
 * nights are guarded at write time by the inventory's rule (in Postgres,
 * the exclusion constraint): an imported stay that would share a night
 * with anything else is stored as a conflict, holding nothing.
 */

export type CalendarAdd = { status: "added" } | { status: "duplicate" } | { status: "unit-missing" } | { status: "channel-missing" };

/** Adding or moving an imported stay: it holds its nights, or it couldn't (the unit is taken, or not offered) and is a conflict. */
export type EventPlacement = { status: "placed" } | { status: "conflict"; reason: "taken" | "unit-unavailable" };

/** A block on a unit, and the channel whose calendar it came from (for "channel" blocks), for the export feed. */
export type FeedBlock = { block: AvailabilityBlock; channel: string | null };

export type SyncRecord = {
  calendarId: string;
  at: Date;
  status: "ok" | "error";
  error: string | null;
  etag: string | null;
  lastModified: string | null;
  run: SyncRun;
};

export interface ChannelStore {
  channels(): Promise<Channel[]>;
  updateChannel(key: string, changes: Pick<Channel, "name" | "active">): Promise<boolean>;

  calendars(): Promise<ChannelCalendar[]>;
  calendar(id: string): Promise<ChannelCalendar | null>;
  /** The calendar's URL as stored (sealed by the UrlVault); null when there's no such calendar. */
  sealedUrl(id: string): Promise<string | null>;
  /** One calendar per unit and channel. */
  addCalendar(calendar: ChannelCalendar, sealedUrl: string): Promise<CalendarAdd>;
  /** A new URL for a calendar: forgets the last fetch's ETag, so the next sync fetches it whole. */
  changeCalendarUrl(id: string, sealedUrl: string, host: string): Promise<boolean>;
  /** Removes a calendar with its imported stays and their blocks (bookings made from them stay). */
  removeCalendar(id: string): Promise<boolean>;
  /** Records a sync's result on the calendar, keeps its run (the last 30 per calendar), and forgets older runs. */
  recordSync(record: SyncRecord): Promise<void>;
  recentRuns(calendarId: string, limit: number): Promise<SyncRun[]>;

  events(calendarId: string): Promise<ChannelEvent[]>;
  /** Events needing a person: conflicts, linked stays whose dates changed, and gone ones. */
  attention(): Promise<ChannelEvent[]>;
  /** Stores a new imported stay with its block (`block.channelEventId` is the event's id), or as a conflict when the block can't go in. */
  addEvent(event: ChannelEvent, block: AvailabilityBlock): Promise<EventPlacement>;
  /**
   * New dates for a placeholder or conflict: its block is replaced by
   * `block` (same id rules), or, when that can't go in, the event becomes a
   * conflict holding nothing. False result never: missing events are added
   * fresh by the caller instead.
   */
  moveEvent(eventId: string, stay: Stay, block: AvailabilityBlock, seenAt: Date): Promise<EventPlacement>;
  /** Changes a linked or gone event's status, note or dates without touching any booking or block. */
  markEvent(eventId: string, changes: { status: EventStatus; note: string | null; stay: Stay; seenAt: Date }): Promise<boolean>;
  /** Removes an imported stay and its block. */
  removeEvent(eventId: string): Promise<boolean>;

  /** The unit's export feed token (sealed), or null before one exists. */
  unitFeed(unitId: string): Promise<{ sealedToken: string; createdAt: Date } | null>;
  /** Sets (or replaces) a unit's feed token. */
  setUnitFeed(unitId: string, tokenHash: string, sealedToken: string, at: Date): Promise<boolean>;
  /** The unit whose feed token hashes to `tokenHash`. */
  unitForFeed(tokenHash: string): Promise<string | null>;
  /** The blocks on a unit with a night in `range`, each with the channel its stay came from. */
  feedBlocks(unitId: string, range: Stay): Promise<FeedBlock[]>;
}

/** What fetching a channel's calendar answered. */
export type FetchedCalendar =
  | { status: "fetched"; text: string; etag: string | null; lastModified: string | null }
  /** Unchanged since the ETag or Last-Modified sent. */
  | { status: "not-modified" }
  /** Why it failed, in plain words for the dashboard; never the URL. */
  | { status: "failed"; reason: string };

/**
 * Where imported stays come from. The iCal adapter fetches a channel's
 * calendar link; a paid channel manager could replace it later without the
 * core changing.
 */
export interface ChannelManager {
  fetchCalendar(url: string, conditions: { etag: string | null; lastModified: string | null }): Promise<FetchedCalendar>;
}

/** Keeps secrets (calendar URLs, feed tokens) encrypted at rest, each bound to where it belongs. */
export interface SecretVault {
  seal(secret: string, context: string): string;
  /** Throws when the value was altered, belongs elsewhere or its key is gone. */
  open(sealed: string, context: string): string;
}

/** Feed tokens: long random secrets, stored as their SHA-256. */
export interface FeedTokens {
  newToken(): string;
  hash(token: string): string;
}

export type ChannelPermission = "channels:status" | "channels:configure";

export interface ChannelAccess {
  can(actor: Actor, permission: ChannelPermission): boolean;
  assertCan(actor: Actor, permission: ChannelPermission): void;
}
