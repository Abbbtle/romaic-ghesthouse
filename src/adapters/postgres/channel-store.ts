import "server-only";
import { calendarStatuses, eventStatuses, type CalendarStatus, type Channel, type ChannelCalendar, type ChannelEvent, type EventStatus, type SyncOutcome, type SyncRun } from "@/lib/channels/channels";
import type { CalendarAdd, ChannelStore, EventPlacement } from "@/lib/channels/ports";
import type { Database, SqlExecutor } from "./database";
import { UniqueViolationError } from "./errors";
import { blockOf, insertBlock, isOverlap } from "./inventory-store";
import { isUuid } from "./uuid";

type CalendarRow = {
  id: string;
  unit_id: string;
  channel: string;
  url_host: string;
  last_synced_at: Date | null;
  last_status: string;
  last_error: string | null;
  etag: string | null;
  last_modified: string | null;
  created_by: string | null;
  created_at: Date;
};

type EventRow = {
  id: string;
  calendar_id: string;
  uid: string;
  arrive: string;
  leave: string;
  status: string;
  booking_id: string | null;
  note: string | null;
  first_seen: Date;
  last_seen: Date;
};

type RunRow = {
  id: string;
  calendar_id: string;
  started_at: Date;
  finished_at: Date;
  outcome: string;
  added: number;
  changed: number;
  removed: number;
  conflicts: number;
  error: string | null;
};

type FeedBlockRow = {
  id: string;
  unit_id: string;
  arrive: string;
  leave: string;
  reason: string;
  note: string | null;
  request_id: string | null;
  booking_id: string | null;
  channel_event_id: string | null;
  created_by: string | null;
  created_at: Date;
  channel: string | null;
};

const calendarColumns = "id, unit_id, channel, url_host, last_synced_at, last_status, last_error, etag, last_modified, created_by, created_at";
const eventColumns = "id, calendar_id, uid, arrive, leave, status, booking_id, note, first_seen, last_seen";
const runColumns = "id, calendar_id, started_at, finished_at, outcome, added, changed, removed, conflicts, error";

/** How many runs a calendar keeps. */
const keptRuns = 30;

const takenNote = "The unit is already taken on one of these nights.";
const unavailableNote = "The unit isn't offered.";

const isCalendarStatus = (value: string): value is CalendarStatus => (calendarStatuses as readonly string[]).includes(value);
const isEventStatus = (value: string): value is EventStatus => (eventStatuses as readonly string[]).includes(value);
const isOutcome = (value: string): value is SyncOutcome => value === "ok" || value === "not-modified" || value === "error";

const calendarOf = (row: CalendarRow): ChannelCalendar => ({
  id: row.id,
  unitId: row.unit_id,
  channel: row.channel,
  host: row.url_host,
  lastSyncedAt: row.last_synced_at,
  lastStatus: isCalendarStatus(row.last_status) ? row.last_status : "error",
  lastError: row.last_error,
  etag: row.etag,
  lastModified: row.last_modified,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const eventOf = (row: EventRow): ChannelEvent => ({
  id: row.id,
  calendarId: row.calendar_id,
  uid: row.uid,
  stay: { arrive: row.arrive, leave: row.leave },
  // The check constraint allows only the known statuses; anything else is shown as needing attention.
  status: isEventStatus(row.status) ? row.status : "conflict",
  bookingId: row.booking_id,
  note: row.note,
  firstSeen: row.first_seen,
  lastSeen: row.last_seen,
});

const runOf = (row: RunRow): SyncRun => ({
  id: row.id,
  calendarId: row.calendar_id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  outcome: isOutcome(row.outcome) ? row.outcome : "error",
  added: row.added,
  changed: row.changed,
  removed: row.removed,
  conflicts: row.conflicts,
  error: row.error,
});

async function insertEvent(sql: SqlExecutor, event: ChannelEvent, status: EventStatus, note: string | null): Promise<void> {
  await sql.run(
    `insert into app.channel_events (id, calendar_id, uid, arrive, leave, status, booking_id, note, first_seen, last_seen)
     values (:id, :calendarId, :uid, :arrive::date, :leave::date, :status, :bookingId, :note, :firstSeen, :lastSeen)`,
    {
      id: event.id,
      calendarId: event.calendarId,
      uid: event.uid,
      arrive: event.stay.arrive,
      leave: event.stay.leave,
      status,
      bookingId: event.bookingId,
      note,
      firstSeen: event.firstSeen,
      lastSeen: event.lastSeen,
    },
  );
}

/** Channels, their calendars, imported stays and unit feeds in Postgres (./migrations/250-channels.ts). */
export function createPostgresChannelStore(db: Database): ChannelStore {
  return {
    async channels() {
      return db.all<Channel>("select key, name, active, sort from app.channels order by sort, key");
    },

    async updateChannel(key, changes) {
      const { changes: count } = await db.run("update app.channels set name = :name, active = :active where key = :key", { key, name: changes.name, active: changes.active });
      return count === 1;
    },

    async calendars() {
      return (await db.all<CalendarRow>(`select ${calendarColumns} from app.channel_calendars order by created_at`)).map(calendarOf);
    },

    async calendar(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<CalendarRow>(`select ${calendarColumns} from app.channel_calendars where id = :id`, { id });
      return row ? calendarOf(row) : null;
    },

    async sealedUrl(id) {
      if (!isUuid(id)) return null;
      return (await db.get<{ url_cipher: string }>("select url_cipher from app.channel_calendars where id = :id", { id }))?.url_cipher ?? null;
    },

    async addCalendar(calendar, sealedUrl): Promise<CalendarAdd> {
      if (!isUuid(calendar.unitId)) return { status: "unit-missing" };
      return db.transaction(async (tx) => {
        if (!(await tx.get("select id from app.units where id = :id", { id: calendar.unitId }))) return { status: "unit-missing" } as const;
        if (!(await tx.get("select key from app.channels where key = :key", { key: calendar.channel }))) return { status: "channel-missing" } as const;
        const { changes } = await tx.run(
          `insert into app.channel_calendars (id, unit_id, channel, url_cipher, url_host, last_status, created_by, created_at)
           values (:id, :unitId, :channel, :urlCipher, :host, 'never', :createdBy, :createdAt)
           on conflict on constraint channel_calendars_one_per_unit do nothing`,
          { id: calendar.id, unitId: calendar.unitId, channel: calendar.channel, urlCipher: sealedUrl, host: calendar.host, createdBy: calendar.createdBy, createdAt: calendar.createdAt },
        );
        return changes === 1 ? ({ status: "added" } as const) : ({ status: "duplicate" } as const);
      });
    },

    async changeCalendarUrl(id, sealedUrl, host) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        "update app.channel_calendars set url_cipher = :urlCipher, url_host = :host, etag = null, last_modified = null where id = :id",
        { id, urlCipher: sealedUrl, host },
      );
      return changes === 1;
    },

    async removeCalendar(id) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("delete from app.channel_calendars where id = :id", { id });
      return changes === 1;
    },

    async recordSync(record) {
      if (!isUuid(record.calendarId)) return;
      await db.transaction(async (tx) => {
        const { changes } = await tx.run(
          `update app.channel_calendars set last_synced_at = :at, last_status = :status, last_error = :error, etag = :etag, last_modified = :lastModified
           where id = :id`,
          { id: record.calendarId, at: record.at, status: record.status, error: record.error, etag: record.etag, lastModified: record.lastModified },
        );
        if (changes !== 1) return;
        const { run } = record;
        await tx.run(
          `insert into app.sync_runs (${runColumns})
           values (:id, :calendarId, :startedAt, :finishedAt, :outcome, :added, :changed, :removed, :conflicts, :error)`,
          {
            id: run.id,
            calendarId: run.calendarId,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            outcome: run.outcome,
            added: run.added,
            changed: run.changed,
            removed: run.removed,
            conflicts: run.conflicts,
            error: run.error,
          },
        );
        await tx.run(
          `delete from app.sync_runs where calendar_id = :id and id not in
             (select id from app.sync_runs where calendar_id = :id order by started_at desc limit :kept)`,
          { id: record.calendarId, kept: keptRuns },
        );
      });
    },

    async recentRuns(calendarId, limit) {
      if (!isUuid(calendarId)) return [];
      const rows = await db.all<RunRow>(`select ${runColumns} from app.sync_runs where calendar_id = :calendarId order by started_at desc limit :limit`, { calendarId, limit });
      return rows.map(runOf);
    },

    async events(calendarId) {
      if (!isUuid(calendarId)) return [];
      const rows = await db.all<EventRow>(`select ${eventColumns} from app.channel_events where calendar_id = :calendarId order by arrive, uid`, { calendarId });
      return rows.map(eventOf);
    },

    async attention() {
      const rows = await db.all<EventRow>(
        `select ${eventColumns} from app.channel_events
         where status in ('conflict', 'gone') or (status = 'linked' and note is not null) order by arrive, uid`,
      );
      return rows.map(eventOf);
    },

    async addEvent(event, block): Promise<EventPlacement> {
      try {
        return await db.transaction(async (tx) => {
          await insertEvent(tx, event, "placeholder", null);
          if ((await insertBlock(tx, block)) === "unit-unavailable") {
            await tx.run("update app.channel_events set status = 'conflict', note = :note where id = :id", { id: event.id, note: unavailableNote });
            return { status: "conflict", reason: "unit-unavailable" } as const;
          }
          return { status: "placed" } as const;
        });
      } catch (error) {
        // The unit was taken on a night: the whole insert rolled back, so the stay goes in again as a conflict, holding nothing.
        if (!isOverlap(error)) throw error;
        await insertEvent(db, event, "conflict", takenNote);
        return { status: "conflict", reason: "taken" };
      }
    },

    async moveEvent(eventId, stay, block, seenAt): Promise<EventPlacement> {
      if (!isUuid(eventId)) return { status: "conflict", reason: "unit-unavailable" };
      const asConflict = async (reason: "taken" | "unit-unavailable"): Promise<EventPlacement> => {
        await db.transaction(async (tx) => {
          await tx.run("delete from app.availability_blocks where channel_event_id = :id", { id: eventId });
          await tx.run(
            "update app.channel_events set arrive = :arrive::date, leave = :leave::date, status = 'conflict', note = :note, last_seen = :seenAt where id = :id",
            { id: eventId, arrive: stay.arrive, leave: stay.leave, note: reason === "taken" ? takenNote : unavailableNote, seenAt },
          );
        });
        return { status: "conflict", reason };
      };
      try {
        const placed = await db.transaction(async (tx) => {
          await tx.run("delete from app.availability_blocks where channel_event_id = :id", { id: eventId });
          await tx.run(
            "update app.channel_events set arrive = :arrive::date, leave = :leave::date, status = 'placeholder', note = null, last_seen = :seenAt where id = :id",
            { id: eventId, arrive: stay.arrive, leave: stay.leave, seenAt },
          );
          return (await insertBlock(tx, block)) === "added";
        });
        return placed ? { status: "placed" } : asConflict("unit-unavailable");
      } catch (error) {
        if (!isOverlap(error)) throw error;
        return asConflict("taken");
      }
    },

    async markEvent(eventId, changes) {
      if (!isUuid(eventId)) return false;
      const { changes: count } = await db.run(
        "update app.channel_events set status = :status, note = :note, arrive = :arrive::date, leave = :leave::date, last_seen = :seenAt where id = :id",
        { id: eventId, status: changes.status, note: changes.note, arrive: changes.stay.arrive, leave: changes.stay.leave, seenAt: changes.seenAt },
      );
      return count === 1;
    },

    async removeEvent(eventId) {
      if (!isUuid(eventId)) return false;
      const { changes } = await db.run("delete from app.channel_events where id = :id", { id: eventId });
      return changes === 1;
    },

    async unitFeed(unitId) {
      if (!isUuid(unitId)) return null;
      const row = await db.get<{ token_cipher: string; created_at: Date }>("select token_cipher, created_at from app.unit_feeds where unit_id = :unitId", { unitId });
      return row ? { sealedToken: row.token_cipher, createdAt: row.created_at } : null;
    },

    async setUnitFeed(unitId, tokenHash, sealedToken, at) {
      if (!isUuid(unitId)) return false;
      try {
        const { changes } = await db.run(
          `insert into app.unit_feeds (unit_id, token_hash, token_cipher, created_at)
           select :unitId, :tokenHash, :sealedToken, :at where exists (select 1 from app.units where id = :unitId)
           on conflict (unit_id) do update set token_hash = excluded.token_hash, token_cipher = excluded.token_cipher, created_at = excluded.created_at`,
          { unitId, tokenHash, sealedToken, at },
        );
        return changes === 1;
      } catch (error) {
        // Two units drawing the same 256-bit token won't happen; refuse rather than share a feed if it ever did.
        if (error instanceof UniqueViolationError && error.constraint === "unit_feeds_token_hash_unique") return false;
        throw error;
      }
    },

    async unitForFeed(tokenHash) {
      if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;
      return (await db.get<{ unit_id: string }>("select unit_id from app.unit_feeds where token_hash = :tokenHash", { tokenHash }))?.unit_id ?? null;
    },

    async feedBlocks(unitId, range) {
      if (!isUuid(unitId)) return [];
      const rows = await db.all<FeedBlockRow>(
        `select b.id, b.unit_id, b.arrive, b.leave, b.reason, b.note, b.request_id, b.booking_id, b.channel_event_id, b.created_by, b.created_at, c.channel
         from app.availability_blocks b
           left join app.channel_events e on e.id = b.channel_event_id
           left join app.channel_calendars c on c.id = e.calendar_id
         where b.unit_id = :unitId and daterange(b.arrive, b.leave, '[)') && daterange(:arrive::date, :leave::date, '[)')
         order by b.arrive, b.id`,
        { unitId, arrive: range.arrive, leave: range.leave },
      );
      return rows.map((row) => ({ block: blockOf(row), channel: row.channel }));
    },
  };
}
