import type { Migration } from "../migrate";

/**
 * Months of the books and their locks, and the books' settings (see
 * ../ledger-store.ts).
 *
 * - app.periods: a row per month that has been locked (no row means open).
 *   A trigger refuses any journal dated in a locked month, so nothing can
 *   post into a filed period, whatever calls the database. Reopening keeps
 *   the reason; both are in the audit log.
 * - app.books_settings: one row: the month the financial year ends
 *   (February by default; open question #5) and the main bank account.
 */
export const periodsMigration: Migration = {
  id: "310-periods",
  sql: /* sql */ `
    create table app.periods (
      period text primary key constraint periods_period check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      status text not null constraint periods_status check (status in ('open', 'locked')),
      locked_at timestamptz,
      locked_by uuid,
      unlock_reason text constraint periods_unlock_reason check (unlock_reason is null or length(unlock_reason) between 1 and 200),
      updated_at timestamptz not null
    );

    create function app.forbid_locked_period() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from app.periods where period = new.period and status = 'locked') then
        raise exception 'period % is locked', new.period using errcode = 'RGLCK';
      end if;
      return new;
    end $$;
    create trigger journals_period_open before insert on app.journals for each row execute function app.forbid_locked_period();

    -- A journal's lines go in with the journal, in the same transaction, and never later: so nobody
    -- (the runtime role included) can add a balanced pair of lines to a posted journal, or to one in a
    -- locked month, past the append-only and period guards.
    create function app.forbid_late_journal_lines() returns trigger language plpgsql as $$
    declare
      created_now boolean;
      locked boolean;
    begin
      select j.xmin::text::bigint = (txid_current() % 4294967296), exists (select 1 from app.periods p where p.period = j.period and p.status = 'locked')
        into created_now, locked from app.journals j where j.id = new.journal_id;
      if created_now is not true then
        raise exception 'journal % was posted in an earlier transaction: its lines can''t change', new.journal_id using errcode = 'RGLCK';
      end if;
      if locked then
        raise exception 'journal % is in a locked month', new.journal_id using errcode = 'RGLCK';
      end if;
      return new;
    end $$;
    create trigger journal_lines_with_their_journal before insert on app.journal_lines for each row execute function app.forbid_late_journal_lines();

    create table app.books_settings (
      id boolean primary key default true constraint books_settings_single check (id),
      year_end_month integer not null constraint books_settings_year_end check (year_end_month between 1 and 12),
      main_bank text not null references app.ledger_accounts (code),
      updated_at timestamptz not null,
      updated_by uuid
    );
    insert into app.books_settings (id, year_end_month, main_bank, updated_at) values (true, 2, '1000', now());

    select app.secure_schema();
  `,
};
