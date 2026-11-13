import { parseWith } from "@/lib/forms/parse";
import { addDays, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { InventoryStore } from "@/lib/inventory/ports";
import { stayLabel, type Stay } from "@/lib/inventory/stays";
import type { AvailabilityBlock, Unit } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { addCalendarSchema, changeCalendarUrlSchema, channelChangeSchema, type Channel, type ChannelCalendar, type ChannelEvent, type SyncRun } from "./channels";
import { unitFeedIcs } from "./feed";
import { parseIcal, type ImportedEvent } from "./ical-parser";
import type { ChannelAccess, ChannelManager, ChannelStore, FeedTokens, SecretVault } from "./ports";

export type ChannelServiceDependencies = {
  store: ChannelStore;
  inventory: Pick<InventoryStore, "units" | "unit">;
  manager: ChannelManager;
  vault: SecretVault;
  tokens: FeedTokens;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: ChannelAccess;
  timeZone: string;
};

/** How far back and ahead the export feed lists nights. */
const feedWindow = { pastDays: 7, aheadDays: 550 } as const;

/** Where a calendar's URL is sealed: decrypting it under any other calendar's id fails. */
export const calendarContext = (calendarId: string) => `channel-calendar:${calendarId}`;
export const feedContext = (unitId: string) => `unit-feed:${unitId}`;

/** A calendar with the names the dashboard shows. */
export type CalendarView = ChannelCalendar & { unitName: string; channelName: string; lastRun: SyncRun | null };

/** An imported stay needing a person, with where it came from. */
export type AttentionView = ChannelEvent & { unitName: string; channelName: string };

export type ChannelsOverview = {
  today: IsoDate;
  channels: Channel[];
  units: Unit[];
  calendars: CalendarView[];
  attention: AttentionView[];
};

/** What one calendar's sync did. */
export type SyncSummary = { calendarId: string; outcome: "ok" | "not-modified" | "error"; added: number; changed: number; removed: number; conflicts: number; error: string | null };

const calendarGone = "That calendar was removed. Reload the page.";
const unexpectedFailure = "Something went wrong reading this calendar. It will be tried again at the next sync.";

export function createChannelService(deps: ChannelServiceDependencies) {
  const { store, inventory, manager, vault, tokens, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor | null, action: string, target: { type: string; id: string }, summary: string) {
    await audit.record({ actor, category: "channels", action, target, summary });
  }

  async function names() {
    const [channels, units] = await Promise.all([store.channels(), inventory.units()]);
    return {
      channels,
      units,
      channelName: (key: string) => channels.find((channel) => channel.key === key)?.name ?? key,
      unitName: (id: string) => units.find((unit) => unit.id === id)?.name ?? "A unit",
    };
  }

  function channelBlock(event: Pick<ChannelEvent, "id" | "stay">, unitId: string, channelName: string): AvailabilityBlock {
    return {
      id: ids.newId(),
      unitId,
      stay: event.stay,
      reason: "channel",
      note: `${channelName} stay`,
      requestId: null,
      bookingId: null,
      channelEventId: event.id,
      createdBy: null,
      createdAt: clock.now(),
    };
  }

  const sameStay = (a: Stay, b: Stay) => a.arrive === b.arrive && a.leave === b.leave;
  /** A stay sales completed as a booking (linked, or gone from the channel since): the booking holds its nights. */
  const holdsBooking = (event: ChannelEvent) => (event.status === "linked" || event.status === "gone") && event.bookingId !== null;

  /** Imports one calendar. Never throws for the calendar's own problems: they're recorded on it. */
  async function syncCalendar(calendar: ChannelCalendar, channelName: string): Promise<SyncSummary> {
    const startedAt = clock.now();
    const summary: SyncSummary = { calendarId: calendar.id, outcome: "ok", added: 0, changed: 0, removed: 0, conflicts: 0, error: null };
    const finish = async (status: "ok" | "error", etag: string | null, lastModified: string | null) => {
      await store.recordSync({
        calendarId: calendar.id,
        at: clock.now(),
        status,
        error: summary.error,
        etag,
        lastModified,
        run: {
          id: ids.newId(),
          calendarId: calendar.id,
          startedAt,
          finishedAt: clock.now(),
          outcome: summary.outcome,
          added: summary.added,
          changed: summary.changed,
          removed: summary.removed,
          conflicts: summary.conflicts,
          error: summary.error,
        },
      });
      return summary;
    };

    let url: string;
    try {
      const sealed = await store.sealedUrl(calendar.id);
      if (!sealed) return { ...summary, outcome: "error", error: calendarGone };
      url = vault.open(sealed, calendarContext(calendar.id));
    } catch {
      summary.outcome = "error";
      summary.error = "The saved link can't be read any more. Paste the calendar link again.";
      return finish("error", null, null);
    }

    const fetched = await manager.fetchCalendar(url, { etag: calendar.etag, lastModified: calendar.lastModified });
    if (fetched.status === "failed") {
      summary.outcome = "error";
      summary.error = fetched.reason;
      return finish("error", calendar.etag, calendar.lastModified);
    }
    if (fetched.status === "not-modified") {
      summary.outcome = "not-modified";
      return finish("ok", calendar.etag, calendar.lastModified);
    }

    if (!/BEGIN:VCALENDAR/i.test(fetched.text)) {
      // Never read a page that isn't a calendar as "no stays": that would remove every imported stay.
      summary.outcome = "error";
      summary.error = "That link didn't give us a calendar. Paste the calendar link from the channel again.";
      return finish("error", calendar.etag, calendar.lastModified);
    }
    const parsed = parseIcal(fetched.text);
    const on = today();
    // Stays that have already ended don't hold anything; they're simply not imported.
    const current = parsed.events.filter((event) => event.stay.leave > on);
    await applyEvents(calendar, channelName, current, summary);
    if (parsed.truncated) summary.error = "The calendar had more stays than can be read at once; only the first were imported.";
    return finish("ok", fetched.etag, fetched.lastModified);
  }

  async function applyEvents(calendar: ChannelCalendar, channelName: string, fetched: readonly ImportedEvent[], summary: SyncSummary) {
    const now = clock.now();
    const stored = await store.events(calendar.id);
    const byUid = new Map(stored.map((event) => [event.uid, event]));
    const seen = new Set<string>();

    for (const incoming of fetched) {
      seen.add(incoming.uid);
      const existing = byUid.get(incoming.uid);
      if (!existing) {
        const event: ChannelEvent = { id: ids.newId(), calendarId: calendar.id, uid: incoming.uid, stay: incoming.stay, status: "placeholder", bookingId: null, note: null, firstSeen: now, lastSeen: now };
        const placed = await store.addEvent(event, channelBlock(event, calendar.unitId, channelName));
        summary.added += 1;
        if (placed.status === "conflict") summary.conflicts += 1;
        continue;
      }
      if (holdsBooking(existing)) {
        // A booking holds these nights now: never touch it, only flag what changed on the channel. The
        // event keeps the dates it was linked with, so the flag stays until someone changes the booking.
        const changed = !sameStay(existing.stay, incoming.stay);
        const note = changed ? `Dates changed on ${channelName}: now ${stayLabel(incoming.stay)}. Check the booking.` : null;
        await store.markEvent(existing.id, { status: "linked", note, stay: existing.stay, seenAt: now });
        if ((changed && note !== existing.note) || existing.status === "gone") summary.changed += 1;
        continue;
      }
      // A conflict tries again for its nights; so does a stay whose booking was deleted (booking_id went null).
      if (!sameStay(existing.stay, incoming.stay) || existing.status !== "placeholder") {
        const placed = await store.moveEvent(existing.id, incoming.stay, channelBlock({ id: existing.id, stay: incoming.stay }, calendar.unitId, channelName), now);
        if (!sameStay(existing.stay, incoming.stay)) summary.changed += 1;
        if (placed.status === "conflict") summary.conflicts += 1;
        continue;
      }
      await store.markEvent(existing.id, { status: existing.status, note: existing.note, stay: existing.stay, seenAt: now });
    }

    for (const event of stored) {
      if (seen.has(event.uid)) continue;
      if (event.status === "linked" && event.bookingId !== null) {
        await store.markEvent(event.id, {
          status: "gone",
          note: `No longer on ${channelName}'s calendar: cancelled there? Check the booking.`,
          stay: event.stay,
          seenAt: event.lastSeen,
        });
        summary.changed += 1;
      } else if (!holdsBooking(event)) {
        await store.removeEvent(event.id);
        summary.removed += 1;
      }
    }
  }

  /**
   * syncCalendar, which never throws for a calendar's own problems, guarded
   * against the unexpected too (a store or adapter failing), so one calendar
   * can never stop the others. The failure is recorded on the calendar when
   * the store still answers.
   */
  async function syncSafely(calendar: ChannelCalendar, channelName: string): Promise<SyncSummary> {
    try {
      return await syncCalendar(calendar, channelName);
    } catch {
      const at = clock.now();
      const failure: SyncSummary = { calendarId: calendar.id, outcome: "error", added: 0, changed: 0, removed: 0, conflicts: 0, error: unexpectedFailure };
      try {
        await store.recordSync({
          calendarId: calendar.id,
          at,
          status: "error",
          error: unexpectedFailure,
          etag: calendar.etag,
          lastModified: calendar.lastModified,
          run: { id: ids.newId(), calendarId: calendar.id, startedAt: at, finishedAt: at, outcome: "error", added: 0, changed: 0, removed: 0, conflicts: 0, error: unexpectedFailure },
        });
      } catch {
        // The store itself is failing: the summary still says this calendar wasn't read.
      }
      return failure;
    }
  }

  /** Imports every calendar of an active channel, one after another; one failing never stops the rest. */
  async function syncAll(): Promise<SyncSummary[]> {
    const [{ channels, channelName }, calendars] = await Promise.all([names(), store.calendars()]);
    const active = new Set(channels.filter((channel) => channel.active).map((channel) => channel.key));
    const summaries: SyncSummary[] = [];
    for (const calendar of calendars.filter((candidate) => active.has(candidate.channel))) {
      summaries.push(await syncSafely(calendar, channelName(calendar.channel)));
    }
    return summaries;
  }

  return {
    today,
    syncAll,

    /** Channels, every unit's imported calendars with their last sync, and the stays needing attention. */
    async overview(actor: Actor): Promise<ChannelsOverview> {
      access.assertCan(actor, "channels:status");
      const { channels, units, channelName, unitName } = await names();
      const [calendars, attention] = await Promise.all([store.calendars(), store.attention()]);
      const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
      const lastRuns = await Promise.all(calendars.map((calendar) => store.recentRuns(calendar.id, 1)));
      return {
        today: today(),
        channels,
        units: units.filter((unit) => unit.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
        calendars: calendars.map((calendar, index) => ({
          ...calendar,
          unitName: unitName(calendar.unitId),
          channelName: channelName(calendar.channel),
          lastRun: lastRuns[index]?.[0] ?? null,
        })),
        attention: attention
          .filter((event) => byId.has(event.calendarId))
          .map((event) => {
            const calendar = byId.get(event.calendarId)!;
            return { ...event, unitName: unitName(calendar.unitId), channelName: channelName(calendar.channel) };
          })
          .sort((a, b) => a.stay.arrive.localeCompare(b.stay.arrive)),
      };
    },

    /** Each unit's export feed token, for those who may share it with channels; null for units without one yet. */
    async feeds(actor: Actor): Promise<{ unitId: string; token: string | null; createdAt: Date | null }[]> {
      access.assertCan(actor, "channels:configure");
      const units = (await inventory.units()).filter((unit) => unit.active);
      return Promise.all(
        units.map(async (unit) => {
          const feed = await store.unitFeed(unit.id);
          if (!feed) return { unitId: unit.id, token: null, createdAt: null };
          try {
            return { unitId: unit.id, token: vault.open(feed.sealedToken, feedContext(unit.id)), createdAt: feed.createdAt };
          } catch {
            // A token sealed with a key that's gone: show none, so it can be reset.
            return { unitId: unit.id, token: null, createdAt: feed.createdAt };
          }
        }),
      );
    },

    /** Makes a unit's feed link, or replaces it: the old link stops working at once, so every channel must be given the new one. */
    async resetFeed(actor: Actor, unitId: string): Promise<ChangeResult> {
      access.assertCan(actor, "channels:configure");
      const unit = await inventory.unit(unitId);
      if (!unit) return refusedWith("That unit no longer exists. Reload the page.");
      const token = tokens.newToken();
      const existed = (await store.unitFeed(unitId)) !== null;
      if (!(await store.setUnitFeed(unitId, tokens.hash(token), vault.seal(token, feedContext(unitId)), clock.now()))) {
        return refusedWith("That unit no longer exists. Reload the page.");
      }
      await record(actor, existed ? "channels.feed-reset" : "channels.feed-created", { type: "unit", id: unitId }, `${existed ? "Replaced" : "Made"} the calendar feed link for ${unit.name}`);
      return done();
    },

    async addCalendar(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "channels:configure");
      const parsed = parseWith(addCalendarSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { unitId, channel, url } = parsed.value;
      const { channelName, unitName } = await names();
      const id = ids.newId();
      const host = new URL(url).hostname.toLowerCase();
      const calendar: ChannelCalendar = {
        id,
        unitId,
        channel,
        host,
        lastSyncedAt: null,
        lastStatus: "never",
        lastError: null,
        etag: null,
        lastModified: null,
        createdBy: actor.id,
        createdAt: clock.now(),
      };
      const outcome = await store.addCalendar(calendar, vault.seal(url, calendarContext(id)));
      if (outcome.status === "duplicate") return refused({ channel: "This unit already has a calendar from that channel. Change its link instead." });
      if (outcome.status === "unit-missing") return refused({ unitId: "Choose a unit from the list." });
      if (outcome.status === "channel-missing") return refused({ channel: "Choose a channel from the list." });
      await record(actor, "channels.calendar-added", { type: "channel-calendar", id }, `Added the ${channelName(channel)} calendar for ${unitName(unitId)} (${host})`);
      return done({ id });
    },

    async changeCalendarUrl(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "channels:configure");
      const parsed = parseWith(changeCalendarUrlSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const calendar = await store.calendar(id);
      if (!calendar) return refusedWith(calendarGone);
      const host = new URL(parsed.value.url).hostname.toLowerCase();
      if (!(await store.changeCalendarUrl(id, vault.seal(parsed.value.url, calendarContext(id)), host))) return refusedWith(calendarGone);
      const { channelName, unitName } = await names();
      await record(actor, "channels.calendar-changed", { type: "channel-calendar", id }, `Changed the ${channelName(calendar.channel)} calendar link for ${unitName(calendar.unitId)} (${host})`);
      return done();
    },

    /** Removes a calendar with its imported stays and the nights they held. Bookings already made from them stay. */
    async removeCalendar(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "channels:configure");
      const calendar = await store.calendar(id);
      if (!calendar || !(await store.removeCalendar(id))) return refusedWith(calendarGone);
      const { channelName, unitName } = await names();
      await record(actor, "channels.calendar-removed", { type: "channel-calendar", id }, `Removed the ${channelName(calendar.channel)} calendar for ${unitName(calendar.unitId)}`);
      return done();
    },

    async updateChannel(actor: Actor, key: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "channels:configure");
      const parsed = parseWith(channelChangeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      if (!(await store.updateChannel(key, parsed.value))) return refusedWith("That channel no longer exists. Reload the page.");
      await record(actor, "channels.channel-changed", { type: "channel", id: key }, `${parsed.value.active ? "Turned on" : "Turned off"} ${parsed.value.name}`);
      return done();
    },

    /** "Sync now": one calendar, or every calendar of an active channel. */
    async syncNow(actor: Actor, calendarId: string | null): Promise<ChangeResult<{ summaries: SyncSummary[] }>> {
      access.assertCan(actor, "channels:status");
      if (calendarId) {
        const calendar = await store.calendar(calendarId);
        if (!calendar) return refusedWith(calendarGone);
        const { channelName } = await names();
        return done({ summaries: [await syncSafely(calendar, channelName(calendar.channel))] });
      }
      return done({ summaries: await syncAll() });
    },

    /** A unit's export feed for the token in its link, optionally leaving out one channel's own stays; null for an unknown token. */
    async feedIcs(token: string, forChannel: string | null): Promise<string | null> {
      const unitId = await store.unitForFeed(tokens.hash(token));
      if (!unitId) return null;
      const on = today();
      const blocks = await store.feedBlocks(unitId, { arrive: addDays(on, -feedWindow.pastDays), leave: addDays(on, feedWindow.aheadDays) });
      return unitFeedIcs({ blocks, forChannel });
    },
  };
}

export type ChannelService = ReturnType<typeof createChannelService>;
