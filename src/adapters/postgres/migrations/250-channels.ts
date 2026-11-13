import type { Migration } from "../migrate";

/**
 * Channels and two-way iCal (see ../channel-store.ts and src/lib/channels).
 *
 * - app.channels: the travel agents Romaic sells on, seeded with Booking.com
 *   (on) and the others (off until the owner turns them on).
 * - app.channel_calendars: per unit and channel, the channel's calendar link,
 *   encrypted (url_cipher, AES-256-GCM, bound to the calendar's id), with its
 *   host in plain text for display and the last sync's result.
 * - app.channel_events: each stay imported from a calendar. A placeholder
 *   holds its nights through a block with reason 'channel'; a conflict holds
 *   nothing (its unit was already taken: a double booking to sort out); a
 *   linked one became a booking (booking_id), which holds the nights instead.
 *   Deleting an event deletes its block (the foreign key below cascades).
 * - app.unit_feeds: each unit's export feed token, as its SHA-256 (to find
 *   the unit from a feed link) and encrypted (to show the link again).
 * - app.sync_runs: the last runs per calendar, for the dashboard.
 */
export const channelsMigration: Migration = {
  id: "250-channels",
  sql: /* sql */ `
    create table app.channels (
      key text primary key constraint channels_key_format check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(key) <= 32),
      name text not null constraint channels_name_length check (length(btrim(name)) between 1 and 40),
      active boolean not null default false,
      sort integer not null default 0
    );
    insert into app.channels (key, name, active, sort) values
      ('booking-com', 'Booking.com', true, 1),
      ('airbnb', 'Airbnb', false, 2),
      ('expedia', 'Expedia', false, 3),
      ('lekkeslaap', 'LekkeSlaap', false, 4),
      ('safarinow', 'SafariNow', false, 5);

    create table app.channel_calendars (
      id uuid primary key,
      unit_id uuid not null references app.units (id) on delete cascade,
      channel text not null references app.channels (key) on delete restrict,
      url_cipher text not null constraint channel_calendars_url_cipher_length check (length(url_cipher) <= 4000),
      url_host text not null constraint channel_calendars_url_host_length check (length(url_host) between 1 and 253),
      last_synced_at timestamptz,
      last_status text not null default 'never' constraint channel_calendars_last_status check (last_status in ('never', 'ok', 'error')),
      last_error text constraint channel_calendars_last_error_length check (last_error is null or length(last_error) <= 300),
      etag text constraint channel_calendars_etag_length check (etag is null or length(etag) <= 200),
      last_modified text constraint channel_calendars_last_modified_length check (last_modified is null or length(last_modified) <= 100),
      created_by uuid,
      created_at timestamptz not null,
      constraint channel_calendars_one_per_unit unique (unit_id, channel)
    );

    create table app.channel_events (
      id uuid primary key,
      calendar_id uuid not null references app.channel_calendars (id) on delete cascade,
      uid text not null constraint channel_events_uid_length check (length(uid) between 1 and 255),
      arrive date not null,
      leave date not null,
      status text not null constraint channel_events_status check (status in ('placeholder', 'conflict', 'linked', 'gone')),
      booking_id uuid references app.bookings (id) on delete set null,
      note text constraint channel_events_note_length check (note is null or length(note) <= 300),
      first_seen timestamptz not null,
      last_seen timestamptz not null,
      constraint channel_events_stay check (leave > arrive),
      constraint channel_events_uid_unique unique (calendar_id, uid)
    );
    create index channel_events_attention on app.channel_events (arrive) where status in ('conflict', 'gone') or (status = 'linked' and note is not null);

    alter table app.availability_blocks
      add constraint availability_blocks_channel_event_link foreign key (channel_event_id) references app.channel_events (id) on delete cascade;

    create table app.unit_feeds (
      unit_id uuid primary key references app.units (id) on delete cascade,
      token_hash text not null constraint unit_feeds_token_hash_unique unique constraint unit_feeds_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
      token_cipher text not null constraint unit_feeds_token_cipher_length check (length(token_cipher) <= 1000),
      created_at timestamptz not null
    );

    create table app.sync_runs (
      id uuid primary key,
      calendar_id uuid not null references app.channel_calendars (id) on delete cascade,
      started_at timestamptz not null,
      finished_at timestamptz not null,
      outcome text not null constraint sync_runs_outcome check (outcome in ('ok', 'not-modified', 'error')),
      added integer not null default 0,
      changed integer not null default 0,
      removed integer not null default 0,
      conflicts integer not null default 0,
      error text constraint sync_runs_error_length check (error is null or length(error) <= 300)
    );
    create index sync_runs_by_calendar on app.sync_runs (calendar_id, started_at desc);

    select app.secure_schema();
  `,
};
