import type { Migration } from "../migrate";

/**
 * The inventory (see ../inventory-store.ts): the guesthouse's units, each an
 * apartment of a type the site describes, and the blocks that close a unit
 * for some nights.
 *
 * A block's nights are [arrive, leave): the leaving day is free for the next
 * guest. availability_blocks_no_overlap keeps two blocks on one unit from
 * sharing a night, whatever the application does, which needs btree_gist
 * (for the uuid's equality in a GiST index). It lives in schema
 * `extensions`, as Supabase keeps extensions, so nothing of it is in a
 * schema the Data API exposes.
 *
 * Migration 100 was planned for room types; they became site content (the
 * "apartments" section, versioned with the rest), so it was never used.
 */
export const inventoryMigration: Migration = {
  id: "110-inventory",
  sql: /* sql */ `
    create schema if not exists extensions;
    create extension if not exists btree_gist with schema extensions;

    create table app.units (
      id uuid primary key,
      -- The apartment type's link name in the site's content.
      apartment text not null constraint units_apartment_format check (apartment ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(apartment) <= 48),
      name text not null constraint units_name_length check (length(btrim(name)) between 1 and 40),
      sort integer not null default 0,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );
    create unique index units_name_unique on app.units (lower(name));

    create table app.availability_blocks (
      id uuid primary key,
      unit_id uuid not null references app.units (id) on delete restrict,
      arrive date not null,
      leave date not null,
      reason text not null constraint availability_blocks_reason check (reason in ('owner', 'maintenance', 'request')),
      note text constraint availability_blocks_note_length check (note is null or length(note) <= 200),
      -- The booking request a "request" block came from; null once the request is deleted under its retention rule.
      request_id uuid,
      created_by uuid,
      created_at timestamptz not null,
      constraint availability_blocks_nights check (leave > arrive),
      constraint availability_blocks_request_only check (reason = 'request' or request_id is null),
      constraint availability_blocks_no_overlap exclude using gist (unit_id with =, daterange(arrive, leave, '[)') with &&)
    );
    create index availability_blocks_by_nights on app.availability_blocks using gist (daterange(arrive, leave, '[)'));

    select app.secure_schema();
  `,
};
