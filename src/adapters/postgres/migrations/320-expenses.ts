import type { Migration } from "../migrate";

/**
 * Expenses and suppliers (see ../expense-store.ts and src/lib/bookkeeping).
 * Amounts are integer cents (ZAR).
 *
 * - app.suppliers: who expenses are paid to, one per name (ignoring
 *   capitals and spaces). A supplier can be renamed, never deleted.
 * - app.expenses: each expense, the account it's spent against, where the
 *   money came from, an optional receipt (a private file) and the journal
 *   that posted it. Never deleted (SARS keeps five years of records): a
 *   mistake is voided with its reason and its journal reversed. Triggers
 *   refuse DELETE and TRUNCATE, and refuse changing what an expense says
 *   once written; only noting its journal, its receipt, and voiding it (with
 *   the reversal's journal) can fill in what was empty, once.
 *
 * Expenses carry no VAT while the business isn't VAT-registered (open
 * question #1): vat_cents must be null, as on invoices (migration 260).
 * The bank account an expense was paid from gets its foreign key in
 * migration 330, which creates app.bank_accounts.
 */
export const expensesMigration: Migration = {
  id: "320-expenses",
  sql: /* sql */ `
    create function app.forbid_books_delete() returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'app.% keeps every record: it can''t be deleted', tg_table_name using errcode = 'insufficient_privilege';
    end
    $$;

    create table app.suppliers (
      id uuid primary key,
      name text not null constraint suppliers_name_length check (length(btrim(name)) between 1 and 80),
      -- The name as it's compared: trimmed, single-spaced, lower case.
      name_key text generated always as (lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))) stored,
      notes text constraint suppliers_notes_length check (notes is null or length(notes) <= 500),
      created_at timestamptz not null,
      created_by uuid,
      constraint suppliers_name_unique unique (name_key)
    );

    create table app.expenses (
      id uuid primary key,
      expense_date date not null,
      supplier_id uuid not null constraint expenses_supplier_fk references app.suppliers (id) on delete restrict,
      account_code text not null constraint expenses_account_fk references app.ledger_accounts (code),
      amount_cents bigint not null constraint expenses_amount check (amount_cents between 1 and 100000000),
      description text not null constraint expenses_description_length check (length(btrim(description)) between 1 and 200),
      paid_by text not null constraint expenses_paid_by check (paid_by in ('bank', 'cash', 'channel', 'owner')),
      paid_from text not null constraint expenses_paid_from_fk references app.ledger_accounts (code),
      bank_account_id uuid,
      receipt_file_id uuid constraint expenses_receipt_fk references app.private_files (id),
      journal_id uuid constraint expenses_journal_fk references app.journals (id),
      vat_cents bigint constraint expenses_no_vat check (vat_cents is null),
      recorded_by uuid,
      created_at timestamptz not null,
      voided_at timestamptz,
      void_reason text constraint expenses_void_reason_length check (void_reason is null or length(btrim(void_reason)) between 1 and 200),
      voided_by uuid,
      void_journal_id uuid constraint expenses_void_journal_fk references app.journals (id),
      -- Spent against an expense account, or an asset bought outright (15xx).
      constraint expenses_account_kind check (account_code ~ '^[56][0-9]{3}$' or account_code ~ '^15[0-9]{2}$'),
      -- Where the money came from matches how it was paid.
      constraint expenses_paid_from_matches check (
        (paid_by = 'bank' and paid_from ~ '^10[0-9]{2}$' and paid_from not in ('1010', '1020'))
        or (paid_by = 'cash' and paid_from = '1010' and bank_account_id is null)
        or (paid_by = 'channel' and paid_from ~ '^11[0-9]{2}$' and bank_account_id is null)
        or (paid_by = 'owner' and paid_from = '3000' and bank_account_id is null)
      ),
      constraint expenses_voided_with_reason check ((voided_at is null) = (void_reason is null) and (voided_at is null) = (voided_by is null)),
      constraint expenses_void_journal_when_voided check (void_journal_id is null or voided_at is not null),
      constraint expenses_journals_differ check (void_journal_id is null or void_journal_id <> journal_id)
    );
    create index expenses_by_date on app.expenses (expense_date desc, created_at desc);
    create index expenses_by_supplier on app.expenses (supplier_id, expense_date desc);
    create index expenses_by_account on app.expenses (account_code, expense_date desc);

    create function app.guard_supplier_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
        raise exception 'app.suppliers: only a supplier''s name and notes can change' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create function app.guard_expense_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.expense_date <> old.expense_date or new.supplier_id <> old.supplier_id or new.account_code <> old.account_code
        or new.amount_cents <> old.amount_cents or new.description <> old.description or new.paid_by <> old.paid_by or new.paid_from <> old.paid_from
        or new.bank_account_id is distinct from old.bank_account_id or new.vat_cents is distinct from old.vat_cents
        or new.recorded_by is distinct from old.recorded_by or new.created_at <> old.created_at
        or (old.journal_id is not null and new.journal_id is distinct from old.journal_id)
        or (old.receipt_file_id is not null and new.receipt_file_id is distinct from old.receipt_file_id)
        or (old.void_journal_id is not null and new.void_journal_id is distinct from old.void_journal_id)
        or (old.voided_at is not null and (new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by)) then
        raise exception 'app.expenses: what an expense says can''t be changed once written; void it instead' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create trigger suppliers_keep_rows before delete on app.suppliers for each row execute function app.forbid_books_delete();
    create trigger suppliers_keep_table before truncate on app.suppliers for each statement execute function app.forbid_books_delete();
    create trigger suppliers_guard_update before update on app.suppliers for each row execute function app.guard_supplier_update();
    create trigger expenses_keep_rows before delete on app.expenses for each row execute function app.forbid_books_delete();
    create trigger expenses_keep_table before truncate on app.expenses for each statement execute function app.forbid_books_delete();
    create trigger expenses_guard_update before update on app.expenses for each row execute function app.guard_expense_update();

    select app.secure_schema();
  `,
};
