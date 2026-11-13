import type { Migration } from "../migrate";

/**
 * The app's schema and what every later migration relies on.
 *
 * Everything lives in schema app, not public: Supabase's Data API serves the
 * public schema to anyone holding the project's anon key. app.secure_schema()
 * locks the schema away from Supabase's API roles and grants the runtime
 * role what it needs; every migration that adds a table ends by calling it
 * (contract tests check every app table has row level security on, and that
 * the API roles can reach none of them).
 *
 * Two database roles (threat model, "database role"): migrations run as the
 * tables' owner (DATABASE_URL_UNPOOLED), and the site runs as `romaic_app`
 * (DATABASE_URL) when that role exists. The runtime role isn't the owner, so
 * row level security applies to it: each table gets one policy letting it
 * through, while Supabase's API roles get none. Append-only tables (the
 * audit log now, the ledger later) refuse UPDATE, DELETE and TRUNCATE by
 * trigger for everyone, and the runtime role isn't even granted them.
 * Where `romaic_app` doesn't exist (PGlite, a plain local Postgres), the site
 * connects as the owner and the triggers still hold.
 */
export const coreMigration: Migration = {
  id: "001-core",
  sql: /* sql */ `
    create schema if not exists app;

    -- Which migrations have run (see ../migrate.ts).
    create table app.schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );

    -- Attempts per key in fixed windows, counted in the database so every server shares one
    -- count (see ../rate-limiter.ts). Keys are hashes: the table never holds the addresses or
    -- visitor keys being counted.
    create table app.rate_limits (
      scope text not null,
      key text not null,
      window_started_ms bigint not null,
      attempts integer not null,
      primary key (scope, key)
    );
    create index rate_limits_by_window on app.rate_limits (scope, window_started_ms);

    -- Refuses any change to a row once written, and TRUNCATE of the whole table. Attached to
    -- append-only tables by app.make_append_only(); a correction is a new row, never an edit.
    create function app.forbid_change() returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'app.% is append-only: % is not allowed', tg_table_name, lower(tg_op)
        using errcode = 'insufficient_privilege';
    end
    $$;

    create function app.make_append_only(target regclass) returns void
    language plpgsql
    as $$
    begin
      execute format('create trigger append_only_rows before update or delete on %s for each row execute function app.forbid_change()', target);
      execute format('create trigger append_only_table before truncate on %s for each statement execute function app.forbid_change()', target);
    end
    $$;

    -- Lets the runtime role (romaic_app) use every app table through one permissive policy, and
    -- grants it data access, minus UPDATE, DELETE and TRUNCATE on append-only tables. Skipped
    -- where the role doesn't exist.
    create function app.grant_runtime() returns void
    language plpgsql
    as $$
    declare
      stored record;
    begin
      if not exists (select from pg_roles where rolname = 'romaic_app') then
        return;
      end if;
      grant usage on schema app to romaic_app;
      grant select, insert, update, delete on all tables in schema app to romaic_app;
      grant usage, select on all sequences in schema app to romaic_app;
      revoke truncate on all tables in schema app from romaic_app;
      for stored in
        select c.oid::regclass as rel, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind in ('r', 'p')
      loop
        if not exists (
          select from pg_policies where schemaname = 'app' and tablename = stored.relname and policyname = 'runtime_access'
        ) then
          execute format('create policy runtime_access on %s to romaic_app using (true) with check (true)', stored.rel);
        end if;
        if exists (
          select from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = stored.rel and p.proname = 'forbid_change'
        ) then
          execute format('revoke update, delete on %s from romaic_app', stored.rel);
        end if;
      end loop;
    end
    $$;

    -- Keeps Supabase's API roles out of schema app. Tables get row level security; the owner
    -- isn't restricted by it, the runtime role passes through its one policy, and any other role
    -- that somehow reached a table would see no rows. anon and authenticated (the roles the Data
    -- API and Realtime act as) lose every privilege here. Elsewhere (PGlite, a plain Postgres)
    -- those roles don't exist, so that part is skipped.
    create function app.secure_schema() returns void
    language plpgsql
    as $$
    declare
      stored regclass;
      api_role text;
    begin
      for stored in
        select c.oid::regclass
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind in ('r', 'p') and not c.relrowsecurity
      loop
        execute format('alter table %s enable row level security', stored);
      end loop;

      revoke all on schema app from public;
      foreach api_role in array array['anon', 'authenticated'] loop
        if exists (select from pg_roles where rolname = api_role) then
          execute format('revoke all on schema app from %I', api_role);
          execute format('revoke all on all tables in schema app from %I', api_role);
          execute format('revoke all on all sequences in schema app from %I', api_role);
          execute format('revoke all on all functions in schema app from %I', api_role);
          execute format('alter default privileges in schema app revoke all on tables from %I', api_role);
          execute format('alter default privileges in schema app revoke all on sequences from %I', api_role);
          execute format('alter default privileges in schema app revoke all on functions from %I', api_role);
        end if;
      end loop;

      perform app.grant_runtime();
    end
    $$;

    select app.secure_schema();
  `,
};
