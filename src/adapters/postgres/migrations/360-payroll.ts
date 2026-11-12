import type { Migration } from "../migrate";

/**
 * Employees and payroll as recorded (see ../payroll-store.ts and
 * src/lib/tax/payroll.ts). Amounts are integer cents.
 *
 * - app.employees: name, dates, active, and the tax number sealed by the
 *   app (AES-256-GCM, bound to the employee's id) with only its last digits
 *   in the clear. Never deleted (records are kept for SARS); someone who
 *   leaves gets an end date.
 * - app.payroll_runs: each month's pay per employee, posted to the books
 *   (journal_id). Net pay is always gross less PAYE and the employee's UIF.
 *   A run is never deleted or changed: a mistake is voided once, with its
 *   reason and the journal that reversed it. One run per employee and month
 *   that isn't voided.
 */
export const payrollMigration: Migration = {
  id: "360-payroll",
  sql: /* sql */ `
    create table app.employees (
      id uuid primary key,
      name text not null constraint employees_name check (length(btrim(name)) between 1 and 120),
      start_date date not null,
      end_date date,
      active boolean not null default true,
      tax_number_sealed text constraint employees_tax_number_length check (tax_number_sealed is null or length(tax_number_sealed) <= 500),
      tax_number_last4 text constraint employees_tax_number_last4 check (tax_number_last4 is null or tax_number_last4 ~ '^[0-9]{1,4}$'),
      created_at timestamptz not null,
      created_by uuid,
      updated_at timestamptz not null,
      constraint employees_dates check (end_date is null or end_date >= start_date),
      constraint employees_tax_number_pair check ((tax_number_sealed is null) = (tax_number_last4 is null))
    );

    create table app.payroll_runs (
      id uuid primary key,
      employee_id uuid not null references app.employees (id) on delete restrict,
      period text not null constraint payroll_runs_period check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      paid_on date not null,
      gross_cents bigint not null constraint payroll_runs_gross check (gross_cents between 1 and 100000000),
      paye_cents bigint not null constraint payroll_runs_paye check (paye_cents >= 0),
      uif_employee_cents bigint not null constraint payroll_runs_uif_employee check (uif_employee_cents >= 0),
      uif_employer_cents bigint not null constraint payroll_runs_uif_employer check (uif_employer_cents >= 0),
      sdl_cents bigint not null constraint payroll_runs_sdl check (sdl_cents >= 0),
      net_cents bigint not null constraint payroll_runs_net_positive check (net_cents >= 0),
      journal_id uuid references app.journals (id),
      reversal_journal_id uuid references app.journals (id),
      recorded_at timestamptz not null,
      recorded_by uuid,
      voided_at timestamptz,
      void_reason text constraint payroll_runs_void_reason check (void_reason is null or length(btrim(void_reason)) between 1 and 200),
      constraint payroll_runs_net check (net_cents = gross_cents - paye_cents - uif_employee_cents),
      constraint payroll_runs_voided_with_reason check ((voided_at is null) = (void_reason is null)),
      constraint payroll_runs_reversal_when_voided check (reversal_journal_id is null or voided_at is not null)
    );
    create unique index payroll_runs_one_per_month on app.payroll_runs (employee_id, period) where voided_at is null;
    create index payroll_runs_by_period on app.payroll_runs (period desc, recorded_at desc);

    create function app.guard_employee() returns trigger
    language plpgsql
    as $$
    begin
      if tg_op = 'DELETE' then
        raise exception 'app.employees keeps every employee: give them an end date instead' using errcode = 'insufficient_privilege';
      end if;
      if new.id <> old.id or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
        raise exception 'app.employees: who added an employee, and when, can''t change' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create function app.guard_payroll_run() returns trigger
    language plpgsql
    as $$
    begin
      if tg_op = 'DELETE' then
        raise exception 'app.payroll_runs keeps every run: void it instead' using errcode = 'insufficient_privilege';
      end if;
      if old.voided_at is not null
        or new.id <> old.id or new.employee_id <> old.employee_id or new.period <> old.period or new.paid_on <> old.paid_on
        or new.gross_cents <> old.gross_cents or new.paye_cents <> old.paye_cents or new.uif_employee_cents <> old.uif_employee_cents
        or new.uif_employer_cents <> old.uif_employer_cents or new.sdl_cents <> old.sdl_cents or new.net_cents <> old.net_cents
        or new.journal_id is distinct from old.journal_id or new.recorded_at <> old.recorded_at or new.recorded_by is distinct from old.recorded_by then
        raise exception 'app.payroll_runs: a recorded run can only be voided, once' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create trigger employees_guard before update or delete on app.employees for each row execute function app.guard_employee();
    create trigger employees_keep_table before truncate on app.employees for each statement execute function app.forbid_tax_truncate();
    create trigger payroll_runs_guard before update or delete on app.payroll_runs for each row execute function app.guard_payroll_run();
    create trigger payroll_runs_keep_table before truncate on app.payroll_runs for each statement execute function app.forbid_tax_truncate();

    select app.secure_schema();
  `,
};
