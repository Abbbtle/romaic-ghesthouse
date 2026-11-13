import type { Migration } from "../migrate";

/**
 * Bookings (see ../reservation-store.ts). A booking holds its unit through
 * a row in app.availability_blocks with reason 'booking', so the one
 * exclusion constraint there (availability_blocks_no_overlap) keeps
 * bookings, closures and imported channel stays from ever sharing a night
 * in a unit. Cancelling or a no-show removes that row; changing dates or
 * unit moves it, in the same transaction as the booking.
 *
 * Blocks also gain 'channel' (an imported channel stay, linked to its
 * channel event once the channels migration adds that table), and accepted
 * booking requests now become bookings, linked back here.
 */
export const bookingsMigration: Migration = {
  id: "210-bookings",
  sql: /* sql */ `
    create table app.bookings (
      id uuid primary key,
      reference text not null constraint bookings_reference_unique unique
        constraint bookings_reference_format check (reference ~ '^RG-[A-HJKMNP-Z2-9]{5}$'),
      guest_id uuid not null references app.guests (id) on delete restrict,
      -- Where it came from: direct, phone, walk-in, or a channel's key (booking-com, airbnb…).
      channel text not null constraint bookings_channel_format check (channel ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(channel) <= 32),
      status text not null constraint bookings_status check (status in ('confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show')),
      apartment text not null constraint bookings_apartment_length check (length(apartment) between 1 and 48),
      unit_id uuid not null references app.units (id) on delete restrict,
      arrive date not null,
      leave date not null,
      adults smallint not null constraint bookings_adults check (adults between 1 and 12),
      children smallint not null constraint bookings_children check (children between 0 and 11),
      -- Money in cents (ZAR). The agreed price for the stay, and what's due as a deposit.
      total_cents bigint not null constraint bookings_total check (total_cents between 0 and 100000000),
      deposit_due_cents bigint not null default 0 constraint bookings_deposit check (deposit_due_cents >= 0 and deposit_due_cents <= total_cents),
      -- What staff may see ("late arrival", "extra towels"); notes are for sales and the owner only.
      service_notes text constraint bookings_service_notes_length check (service_notes is null or length(service_notes) <= 300),
      notes text constraint bookings_notes_length check (notes is null or length(notes) <= 1000),
      -- The channel's own booking number, for bookings made there.
      external_ref text constraint bookings_external_ref_length check (external_ref is null or length(external_ref) <= 60),
      request_id uuid references app.booking_requests (id) on delete set null,
      created_by uuid,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      revision integer not null default 1 constraint bookings_revision_positive check (revision >= 1),
      checked_in_at timestamptz,
      checked_out_at timestamptz,
      cancelled_at timestamptz,
      cancel_reason text constraint bookings_cancel_reason_length check (cancel_reason is null or length(cancel_reason) <= 200),
      constraint bookings_stay check (leave > arrive),
      constraint bookings_party check (adults + children <= 12)
    );
    create index bookings_by_arrive on app.bookings (arrive);
    create index bookings_by_leave on app.bookings (leave);
    create index bookings_by_guest on app.bookings (guest_id);

    alter table app.availability_blocks add column booking_id uuid references app.bookings (id) on delete restrict;
    alter table app.availability_blocks add column channel_event_id uuid;
    alter table app.availability_blocks drop constraint availability_blocks_reason;
    alter table app.availability_blocks
      add constraint availability_blocks_reason check (reason in ('owner', 'maintenance', 'request', 'booking', 'channel'));
    alter table app.availability_blocks
      add constraint availability_blocks_booking_link check ((reason = 'booking') = (booking_id is not null));
    alter table app.availability_blocks
      add constraint availability_blocks_channel_link check ((reason = 'channel') = (channel_event_id is not null));
    create unique index availability_blocks_one_per_booking on app.availability_blocks (booking_id) where booking_id is not null;

    alter table app.booking_requests add column booking_id uuid references app.bookings (id) on delete set null;

    select app.secure_schema();
  `,
};
