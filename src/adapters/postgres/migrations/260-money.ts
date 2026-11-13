import type { Migration } from "../migrate";

/**
 * Booking money (see ../money-store.ts): payments, receipts, invoices and
 * the gateway's webhook events. Amounts are integer cents (ZAR).
 *
 * Money records are never deleted (SARS keeps five years of records): a
 * mistake is voided, with its reason, and stays. Triggers refuse DELETE and
 * TRUNCATE on payments and invoices, and refuse changing what a payment or
 * invoice says once it's written (amount, kind, method, booking, lines,
 * number); only its status, voiding and, for an online payment, settling
 * change it.
 *
 * Receipt and invoice numbers come from app.number_sequences, incremented
 * under a row lock in the same transaction as the record, so two people
 * saving at once never get the same number and a rolled-back save doesn't
 * leave a gap.
 *
 * Invoices carry no VAT while the business isn't VAT-registered (open
 * question #1): vat_cents must be null. Registering for VAT later is a new
 * migration that relaxes this, with the rate as dated config (brief rule 6).
 */
export const moneyMigration: Migration = {
  id: "260-money",
  sql: /* sql */ `
    create table app.number_sequences (
      name text primary key,
      next_value bigint not null constraint number_sequences_positive check (next_value >= 1)
    );
    insert into app.number_sequences (name, next_value) values ('receipt', 1), ('invoice', 1) on conflict (name) do nothing;

    create table app.payments (
      id uuid primary key,
      booking_id uuid not null references app.bookings (id) on delete restrict,
      kind text not null constraint payments_kind check (kind in ('deposit', 'balance', 'extra', 'refund')),
      method text not null constraint payments_method check (method in ('cash', 'card-machine', 'eft', 'gateway', 'channel-collected')),
      amount_cents bigint not null constraint payments_amount check (amount_cents between 1 and 100000000),
      received_on date not null,
      reference text constraint payments_reference_length check (reference is null or length(reference) <= 80),
      status text not null constraint payments_status check (status in ('received', 'pending', 'failed')),
      receipt_number text constraint payments_receipt_number_unique unique
        constraint payments_receipt_number_format check (receipt_number is null or receipt_number ~ '^RC-[0-9]{6,}$'),
      provider_ref text constraint payments_provider_ref_unique unique
        constraint payments_provider_ref_length check (provider_ref is null or length(provider_ref) <= 200),
      idempotency_key text constraint payments_idempotency_key_unique unique
        constraint payments_idempotency_key_length check (idempotency_key is null or length(idempotency_key) <= 64),
      recorded_by uuid,
      created_at timestamptz not null,
      voided_at timestamptz,
      void_reason text constraint payments_void_reason_length check (void_reason is null or length(void_reason) <= 200),
      constraint payments_receipt_when_received check ((status = 'received') = (receipt_number is not null)),
      constraint payments_voided_with_reason check ((voided_at is null) = (void_reason is null)),
      constraint payments_gateway_has_ref check (method <> 'gateway' or provider_ref is not null)
    );
    create index payments_by_booking on app.payments (booking_id, created_at);

    create table app.invoices (
      id uuid primary key,
      booking_id uuid not null references app.bookings (id) on delete restrict,
      number text not null constraint invoices_number_unique unique
        constraint invoices_number_format check (number ~ '^INV-[0-9]{6,}$'),
      issued_on date not null,
      -- Who it was billed to, as they were when it was issued: { name, phone, email }.
      billed_to jsonb not null constraint invoices_billed_to_object check (jsonb_typeof(billed_to) = 'object'),
      -- [{ description, quantity, unitCents, amountCents }]
      lines jsonb not null constraint invoices_lines_array check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 20),
      total_cents bigint not null constraint invoices_total check (total_cents between 0 and 1000000000),
      vat_cents bigint constraint invoices_no_vat check (vat_cents is null),
      status text not null constraint invoices_status check (status in ('issued', 'void')),
      void_reason text constraint invoices_void_reason_length check (void_reason is null or length(void_reason) <= 200),
      voided_at timestamptz,
      created_by uuid,
      created_at timestamptz not null,
      constraint invoices_voided_with_reason check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null))
    );
    create index invoices_by_booking on app.invoices (booking_id, created_at);

    -- Each verified webhook event, once: a replay of the same id changes nothing. The body itself isn't kept, only its hash.
    create table app.payment_events (
      provider text not null constraint payment_events_provider_length check (length(provider) between 1 and 40),
      provider_event_id text not null constraint payment_events_id_length check (length(provider_event_id) between 1 and 200),
      received_at timestamptz not null,
      payload_hash text not null constraint payment_events_hash_format check (payload_hash ~ '^[0-9a-f]{64}$'),
      outcome text not null default 'received' constraint payment_events_outcome_length check (length(outcome) <= 40),
      primary key (provider, provider_event_id)
    );

    create function app.forbid_money_delete() returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'app.% keeps every record: void it instead of deleting it', tg_table_name using errcode = 'insufficient_privilege';
    end
    $$;

    create function app.guard_payment_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.booking_id <> old.booking_id or new.kind <> old.kind or new.method <> old.method
        or new.amount_cents <> old.amount_cents or new.created_at <> old.created_at
        or (old.receipt_number is not null and new.receipt_number is distinct from old.receipt_number)
        or (old.voided_at is not null and (new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason)) then
        raise exception 'app.payments: what a payment says can''t be changed once written' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create function app.guard_invoice_update() returns trigger
    language plpgsql
    as $$
    begin
      if new.id <> old.id or new.booking_id <> old.booking_id or new.number <> old.number or new.issued_on <> old.issued_on
        or new.billed_to <> old.billed_to or new.lines <> old.lines or new.total_cents <> old.total_cents
        or new.created_at <> old.created_at or old.status = 'void' then
        raise exception 'app.invoices: an issued invoice can only be voided' using errcode = 'insufficient_privilege';
      end if;
      return new;
    end
    $$;

    create trigger payments_keep_rows before delete on app.payments for each row execute function app.forbid_money_delete();
    create trigger payments_keep_table before truncate on app.payments for each statement execute function app.forbid_money_delete();
    create trigger payments_guard_update before update on app.payments for each row execute function app.guard_payment_update();
    create trigger invoices_keep_rows before delete on app.invoices for each row execute function app.forbid_money_delete();
    create trigger invoices_keep_table before truncate on app.invoices for each statement execute function app.forbid_money_delete();
    create trigger invoices_guard_update before update on app.invoices for each row execute function app.guard_invoice_update();

    select app.secure_schema();
  `,
};
