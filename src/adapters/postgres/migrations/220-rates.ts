import type { Migration } from "../migrate";

/**
 * Rates (see ../rate-store.ts): one plan per apartment type (by its slug in
 * the site's content), and seasons that change the nightly price or the
 * minimum stay for some nights. Money is in cents (ZAR).
 *
 * A season's nights are [starts_on, ends_before): the morning it ends is
 * outside it. seasons_no_overlap keeps two seasons from sharing a night, so
 * every night has at most one season's price. (A GiST index on a daterange
 * alone needs no btree_gist.)
 */
export const ratesMigration: Migration = {
  id: "220-rates",
  sql: /* sql */ `
    create table app.rate_plans (
      apartment text primary key constraint rate_plans_apartment_format check (apartment ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(apartment) <= 48),
      nightly_cents bigint not null constraint rate_plans_nightly check (nightly_cents between 100 and 100000000),
      base_guests smallint not null constraint rate_plans_base_guests check (base_guests between 1 and 12),
      extra_guest_cents bigint not null default 0 constraint rate_plans_extra_guest check (extra_guest_cents between 0 and 100000000),
      min_nights smallint not null default 1 constraint rate_plans_min_nights check (min_nights between 1 and 30),
      active boolean not null default true,
      updated_at timestamptz not null,
      updated_by uuid
    );

    create table app.seasons (
      id uuid primary key,
      name text not null constraint seasons_name_length check (length(btrim(name)) between 1 and 60),
      starts_on date not null,
      ends_before date not null,
      min_nights smallint constraint seasons_min_nights check (min_nights is null or min_nights between 1 and 30),
      updated_at timestamptz not null,
      updated_by uuid,
      constraint seasons_nights check (ends_before > starts_on),
      constraint seasons_no_overlap exclude using gist (daterange(starts_on, ends_before, '[)') with &&)
    );

    create table app.season_rates (
      season_id uuid not null references app.seasons (id) on delete cascade,
      apartment text not null constraint season_rates_apartment_format check (apartment ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(apartment) <= 48),
      nightly_cents bigint not null constraint season_rates_nightly check (nightly_cents between 100 and 100000000),
      primary key (season_id, apartment)
    );

    select app.secure_schema();
  `,
};
