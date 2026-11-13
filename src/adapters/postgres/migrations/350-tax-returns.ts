import type { Migration } from "../migrate";

/**
 * Tax returns prepared from the books (see ../tax-store.ts and
 * src/lib/tax/returns.ts): one per kind and period, moving draft →
 * reviewed → filed (and reviewed → draft to refresh figures). Filing records
 * the date and the proof of submission, a private file.
 *
 * A trigger keeps the rules whatever calls the database: only a draft can be
 * deleted (discarded), a filed return can't change at all, a reviewed one's
 * figures can't change, and no other status move is allowed. TRUNCATE is
 * refused. Figures and the parameter versions they used are kept as JSON,
 * fixed as they were when prepared.
 */
export const taxReturnsMigration: Migration = {
  id: "350-tax-returns",
  sql: /* sql */ `
    create table app.tax_returns (
      id uuid primary key,
      kind text not null constraint tax_returns_kind check (kind in ('vat201', 'turnover', 'irp6', 'emp201')),
      period_start date not null,
      period_end date not null,
      label text not null constraint tax_returns_label check (length(btrim(label)) between 1 and 120),
      status text not null constraint tax_returns_status check (status in ('draft', 'reviewed', 'filed')),
      figures jsonb not null constraint tax_returns_figures check (jsonb_typeof(figures) = 'object'),
      parameters jsonb not null constraint tax_returns_parameters check (jsonb_typeof(parameters) = 'array'),
      due_on date,
      prepared_at timestamptz not null,
      prepared_by uuid,
      reviewed_at timestamptz,
      reviewed_by uuid,
      filed_on date,
      filed_at timestamptz,
      filed_by uuid,
      proof_file_id uuid references app.private_files (id) on delete restrict,
      submission_reference text constraint tax_returns_submission_reference check (submission_reference is null or length(submission_reference) <= 40),
      created_at timestamptz not null,
      constraint tax_returns_period check (period_end >= period_start),
      constraint tax_returns_one_per_period unique (kind, period_start, period_end),
      constraint tax_returns_reviewed check (status = 'draft' or reviewed_at is not null),
      constraint tax_returns_filed check ((status = 'filed') = (filed_on is not null and filed_at is not null and proof_file_id is not null))
    );
    create index tax_returns_by_period on app.tax_returns (period_end desc, created_at desc);

    create function app.guard_tax_return() returns trigger
    language plpgsql
    as $$
    begin
      if tg_op = 'DELETE' then
        if old.status <> 'draft' then
          raise exception 'app.tax_returns: a % return stays on record', old.status using errcode = 'insufficient_privilege';
        end if;
        return old;
      end if;
      if old.status = 'filed' then
        raise exception 'app.tax_returns: a filed return can''t change' using errcode = 'insufficient_privilege';
      end if;
      if new.id <> old.id or new.kind <> old.kind or new.period_start <> old.period_start or new.period_end <> old.period_end or new.created_at <> old.created_at then
        raise exception 'app.tax_returns: a return''s kind and period can''t change' using errcode = 'insufficient_privilege';
      end if;
      if old.status = 'reviewed' and (new.figures <> old.figures or new.parameters <> old.parameters or new.due_on is distinct from old.due_on or new.label <> old.label) then
        raise exception 'app.tax_returns: a reviewed return''s figures can''t change' using errcode = 'insufficient_privilege';
      end if;
      if not (new.status = old.status or (old.status = 'draft' and new.status = 'reviewed') or (old.status = 'reviewed' and new.status in ('draft', 'filed'))) then
        raise exception 'app.tax_returns: a return can''t go from % to %', old.status, new.status using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create function app.forbid_tax_truncate() returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'app.% keeps its records', tg_table_name using errcode = 'insufficient_privilege';
    end
    $$;

    create trigger tax_returns_guard before update or delete on app.tax_returns for each row execute function app.guard_tax_return();
    create trigger tax_returns_keep_table before truncate on app.tax_returns for each statement execute function app.forbid_tax_truncate();

    select app.secure_schema();
  `,
};
