import type { Migration } from "../migrate";

/**
 * Bank accounts, statement imports and reconciliation (see
 * ../bank-store.ts and src/lib/bookkeeping). No bank is connected:
 * statements are imported from CSV files the owner exports.
 *
 * - app.bank_accounts: each account, its own account in the chart (10xx,
 *   one each), how its statements' columns are read, and its number sealed
 *   with DATA_ENCRYPTION_KEY (AES-256-GCM, bound to the account's id); only
 *   the last four digits are kept in the clear. Never deleted; only its
 *   names, how statements are read, and the sealed number (re-sealed with a
 *   newer key) can change.
 * - app.bank_imports: each statement imported, by whom, and what came of
 *   it. Append-only.
 * - app.bank_lines: each statement line, once per account (by its dedupe
 *   hash), and the journal it's matched to: one line per journal on each
 *   account (a transfer between two accounts matches a line on both). Never
 *   deleted; only its match changes (and the count of journals made from
 *   it, which never goes down).
 *
 * Also gives app.expenses (migration 320) its foreign key to the bank
 * account an expense was paid from.
 */
export const bankMigration: Migration = {
  id: "330-bank",
  sql: /* sql */ `
    create table app.bank_accounts (
      id uuid primary key,
      name text not null constraint bank_accounts_name_length check (length(btrim(name)) between 1 and 60),
      bank_name text not null constraint bank_accounts_bank_name_length check (length(btrim(bank_name)) between 1 and 60),
      account_number_sealed text not null constraint bank_accounts_sealed_length check (length(account_number_sealed) between 1 and 1000),
      account_number_last4 text not null constraint bank_accounts_last4_format check (account_number_last4 ~ '^[0-9]{4}$'),
      ledger_code text not null constraint bank_accounts_ledger_fk references app.ledger_accounts (code)
        constraint bank_accounts_ledger_code_unique unique
        constraint bank_accounts_ledger_code_cash check (ledger_code ~ '^10[0-9]{2}$' and ledger_code not in ('1010', '1020')),
      statement_mapping jsonb constraint bank_accounts_mapping_object check (statement_mapping is null or jsonb_typeof(statement_mapping) = 'object'),
      created_at timestamptz not null,
      created_by uuid
    );

    create table app.bank_imports (
      id uuid primary key,
      bank_account_id uuid not null constraint bank_imports_account_fk references app.bank_accounts (id),
      file_name text not null constraint bank_imports_file_name_length check (length(file_name) between 1 and 200),
      imported_at timestamptz not null,
      imported_by uuid,
      row_count integer not null constraint bank_imports_row_count check (row_count between 0 and 100000),
      added_count integer not null constraint bank_imports_added_count check (added_count >= 0),
      duplicate_count integer not null constraint bank_imports_duplicate_count check (duplicate_count >= 0),
      skipped_count integer not null constraint bank_imports_skipped_count check (skipped_count >= 0),
      constraint bank_imports_counts_add_up check (added_count + duplicate_count = row_count)
    );
    create index bank_imports_by_account on app.bank_imports (bank_account_id, imported_at desc);

    create table app.bank_lines (
      id uuid primary key,
      bank_account_id uuid not null constraint bank_lines_account_fk references app.bank_accounts (id),
      import_id uuid not null constraint bank_lines_import_fk references app.bank_imports (id),
      line_date date not null,
      description text not null constraint bank_lines_description_length check (length(description) between 1 and 200),
      amount_cents bigint not null constraint bank_lines_amount check (amount_cents <> 0 and abs(amount_cents) <= 1000000000),
      balance_cents bigint constraint bank_lines_balance check (balance_cents is null or abs(balance_cents) <= 100000000000),
      dedupe_hash text not null constraint bank_lines_dedupe_hash_length check (length(dedupe_hash) between 1 and 128),
      row_number integer not null constraint bank_lines_row_number check (row_number between 1 and 100000),
      matched_journal_id uuid constraint bank_lines_journal_fk references app.journals (id),
      match_kind text constraint bank_lines_match_kind check (match_kind is null or match_kind in ('existing', 'created')),
      matched_at timestamptz,
      matched_by uuid,
      journals_made integer not null default 0 constraint bank_lines_journals_made check (journals_made between 0 and 1000),
      constraint bank_lines_dedupe_unique unique (bank_account_id, dedupe_hash),
      constraint bank_lines_match_complete check ((matched_journal_id is null) = (match_kind is null) and (matched_journal_id is null) = (matched_at is null))
    );
    -- One line per journal on each account: a transfer between two of the owner's accounts is one journal, matched once on each.
    create unique index bank_lines_one_per_journal on app.bank_lines (bank_account_id, matched_journal_id) where matched_journal_id is not null;
    create index bank_lines_by_journal on app.bank_lines (matched_journal_id) where matched_journal_id is not null;
    create index bank_lines_by_account on app.bank_lines (bank_account_id, line_date desc, row_number desc);

    alter table app.expenses add constraint expenses_bank_account_fk foreign key (bank_account_id) references app.bank_accounts (id);

    create function app.guard_bank_account_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.account_number_last4 <> old.account_number_last4 or new.ledger_code <> old.ledger_code
        or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
        raise exception 'app.bank_accounts: only an account''s names and how its statements are read can change' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create function app.guard_bank_line_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.bank_account_id <> old.bank_account_id or new.import_id <> old.import_id or new.line_date <> old.line_date
        or new.description <> old.description or new.amount_cents <> old.amount_cents or new.balance_cents is distinct from old.balance_cents
        or new.dedupe_hash <> old.dedupe_hash or new.row_number <> old.row_number or new.journals_made < old.journals_made then
        raise exception 'app.bank_lines: a statement line can''t be changed, only matched' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create trigger bank_accounts_keep_rows before delete on app.bank_accounts for each row execute function app.forbid_books_delete();
    create trigger bank_accounts_keep_table before truncate on app.bank_accounts for each statement execute function app.forbid_books_delete();
    create trigger bank_accounts_guard_update before update on app.bank_accounts for each row execute function app.guard_bank_account_update();
    create trigger bank_lines_keep_rows before delete on app.bank_lines for each row execute function app.forbid_books_delete();
    create trigger bank_lines_keep_table before truncate on app.bank_lines for each statement execute function app.forbid_books_delete();
    create trigger bank_lines_guard_update before update on app.bank_lines for each row execute function app.guard_bank_line_update();
    select app.make_append_only('app.bank_imports');

    select app.secure_schema();
  `,
};
