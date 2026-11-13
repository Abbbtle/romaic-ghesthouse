import type { Migration } from "../migrate";

/**
 * The ledger (see ../ledger-store.ts and src/lib/ledger): double entry in
 * integer cents.
 *
 * - app.ledger_accounts: the chart, seeded with the draft guesthouse chart
 *   (build-plan) for the accountant to confirm. VAT accounts start off.
 * - app.journals and app.journal_lines: append-only (app.make_append_only),
 *   so a posted journal never changes; corrections are reversals. Every
 *   journal balances, checked when its transaction commits (a deferred
 *   constraint trigger), with at least two lines, each one side only.
 *   One journal per automatic source (payment, booking, expense, bank
 *   line), and each journal reversed at most once.
 */
export const ledgerMigration: Migration = {
  id: "300-ledger",
  sql: /* sql */ `
    create table app.ledger_accounts (
      code text primary key constraint ledger_accounts_code check (code ~ '^[1-6][0-9]{3}$'),
      name text not null constraint ledger_accounts_name check (length(btrim(name)) between 1 and 60),
      kind text not null constraint ledger_accounts_kind check (kind in ('asset', 'liability', 'equity', 'income', 'expense')),
      system boolean not null default false,
      active boolean not null default true,
      constraint ledger_accounts_kind_by_code check (
        (kind = 'asset' and code like '1%') or (kind = 'liability' and code like '2%') or (kind = 'equity' and code like '3%')
        or (kind = 'income' and code like '4%') or (kind = 'expense' and (code like '5%' or code like '6%'))
      )
    );

    insert into app.ledger_accounts (code, name, kind, system, active) values
      ('1000', 'Bank', 'asset', true, true),
      ('1010', 'Cash on hand', 'asset', true, true),
      ('1020', 'Payment gateway clearing', 'asset', true, true),
      ('1100', 'Channel receivables (other)', 'asset', true, true),
      ('1110', 'Booking.com receivable', 'asset', true, true),
      ('1111', 'Airbnb receivable', 'asset', true, true),
      ('1112', 'Expedia receivable', 'asset', true, true),
      ('1113', 'LekkeSlaap receivable', 'asset', true, true),
      ('1114', 'SafariNow receivable', 'asset', true, true),
      ('1200', 'Guest receivables', 'asset', true, true),
      ('1300', 'VAT input', 'asset', true, false),
      ('1500', 'Equipment and furniture', 'asset', true, true),
      ('1510', 'Accumulated depreciation', 'asset', true, true),
      ('2000', 'Guest deposits received', 'liability', true, true),
      ('2100', 'VAT output', 'liability', true, false),
      ('2200', 'PAYE payable', 'liability', true, true),
      ('2210', 'UIF payable', 'liability', true, true),
      ('2220', 'SDL payable', 'liability', true, true),
      ('2300', 'Channel commission payable', 'liability', true, true),
      ('2400', 'Loans', 'liability', true, true),
      ('3000', 'Owner''s capital', 'equity', true, true),
      ('3100', 'Drawings', 'equity', true, true),
      ('3200', 'Retained earnings', 'equity', true, true),
      ('4000', 'Accommodation', 'income', true, true),
      ('4100', 'Breakfast and meals', 'income', true, true),
      ('4200', 'Laundry and ironing', 'income', true, true),
      ('4900', 'Other income', 'income', true, true),
      ('5000', 'Channel commission', 'expense', true, true),
      ('5100', 'Gateway and bank charges', 'expense', true, true),
      ('5200', 'Cleaning supplies and linen', 'expense', true, true),
      ('5300', 'Electricity, water and gas', 'expense', true, true),
      ('5400', 'Municipal rates', 'expense', true, true),
      ('5500', 'Repairs and maintenance', 'expense', true, true),
      ('5600', 'Insurance', 'expense', true, true),
      ('5700', 'Internet and phone', 'expense', true, true),
      ('5800', 'Advertising', 'expense', true, true),
      ('6000', 'Salaries and wages', 'expense', true, true),
      ('6100', 'Employer UIF and SDL', 'expense', true, true),
      ('6200', 'Depreciation', 'expense', true, true);

    create table app.journals (
      id uuid primary key,
      entry_date date not null,
      period text not null constraint journals_period check (period = to_char(entry_date, 'YYYY-MM')),
      memo text not null constraint journals_memo check (length(btrim(memo)) between 1 and 400),
      source_type text constraint journals_source_type check (source_type is null or source_type ~ '^[a-z-]{1,20}$'),
      source_id text constraint journals_source_id check (source_id is null or length(source_id) between 1 and 80),
      source_part text constraint journals_source_part check (source_part is null or length(source_part) between 1 and 60),
      reversal_of uuid references app.journals (id),
      posted_by uuid,
      posted_at timestamptz not null,
      constraint journals_source_complete check ((source_type is null) = (source_id is null) and (source_id is null) = (source_part is null)),
      constraint journals_source_unique unique (source_type, source_id, source_part)
    );
    create unique index journals_one_reversal on app.journals (reversal_of) where reversal_of is not null;
    create index journals_by_date on app.journals (entry_date desc, posted_at desc);

    create table app.journal_lines (
      journal_id uuid not null references app.journals (id),
      line_no integer not null constraint journal_lines_line_no check (line_no between 0 and 39),
      account_code text not null references app.ledger_accounts (code),
      debit_cents integer not null default 0 constraint journal_lines_debit check (debit_cents >= 0),
      credit_cents integer not null default 0 constraint journal_lines_credit check (credit_cents >= 0),
      party text constraint journal_lines_party check (party is null or length(party) between 1 and 80),
      memo text constraint journal_lines_memo check (memo is null or length(memo) <= 200),
      primary key (journal_id, line_no),
      constraint journal_lines_one_side check ((debit_cents > 0) <> (credit_cents > 0))
    );
    create index journal_lines_by_account on app.journal_lines (account_code);
    create index journal_lines_by_party on app.journal_lines (account_code, party) where party is not null;

    create function app.check_journal_balanced() returns trigger language plpgsql as $$
    declare
      target uuid;
      debits bigint;
      credits bigint;
      line_count integer;
    begin
      if tg_table_name = 'journals' then target := new.id; else target := new.journal_id; end if;
      select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0), count(*) into debits, credits, line_count
        from app.journal_lines where journal_id = target;
      if line_count < 2 or debits <> credits then
        raise exception 'journal % does not balance', target using errcode = '23514', constraint = 'journals_balanced';
      end if;
      return null;
    end $$;
    create constraint trigger journals_balanced after insert on app.journals
      deferrable initially deferred for each row execute function app.check_journal_balanced();
    create constraint trigger journal_lines_balanced after insert on app.journal_lines
      deferrable initially deferred for each row execute function app.check_journal_balanced();

    select app.make_append_only('app.journals');
    select app.make_append_only('app.journal_lines');
    select app.secure_schema();
  `,
};
