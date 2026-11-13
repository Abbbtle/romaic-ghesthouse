import type { Migration } from "../migrate";

/**
 * Booking requests from the public site (see ../booking-store.ts). Each
 * keeps the consent it was sent under: when the box was ticked, and the
 * versions of the consent wording and the privacy notice (POPIA s11, s18).
 * The visitor key (a keyed hash of the IP address) is forgotten after 24
 * hours, and handled requests are deleted under the retention rule in
 * src/lib/booking/retention.ts.
 *
 * Waiting requests never hold nights; accepting one adds a "request" block
 * on the chosen unit in the same transaction, linked back here. Deleting a
 * request later keeps the block (the nights stay taken) and unlinks it.
 */
export const bookingRequestsMigration: Migration = {
  id: "120-booking-requests",
  sql: /* sql */ `
    create table app.booking_requests (
      id uuid primary key,
      reference text not null constraint booking_requests_reference_unique unique
        constraint booking_requests_reference_format check (reference ~ '^RG-[A-HJKMNP-Z2-9]{5}$'),
      apartment text not null constraint booking_requests_apartment_length check (length(apartment) between 1 and 48),
      apartment_name text not null constraint booking_requests_apartment_name_length check (length(apartment_name) <= 60),
      arrive date not null,
      leave date not null,
      adults smallint not null constraint booking_requests_adults check (adults between 1 and 12),
      children smallint not null constraint booking_requests_children check (children between 0 and 11),
      name text not null constraint booking_requests_name_length check (length(name) between 2 and 80),
      phone text not null constraint booking_requests_phone_format check (phone ~ '^\\+[1-9][0-9]{6,14}$'),
      email text constraint booking_requests_email_length check (email is null or length(email) <= 254),
      arrival_time text constraint booking_requests_arrival_time_length check (arrival_time is null or length(arrival_time) <= 40),
      notes text constraint booking_requests_notes_length check (notes is null or length(notes) <= 500),
      consented_at timestamptz not null,
      consent_version text not null constraint booking_requests_consent_version_length check (length(consent_version) <= 20),
      notice_version text not null constraint booking_requests_notice_version_length check (length(notice_version) <= 20),
      status text not null constraint booking_requests_status check (status in ('waiting', 'accepted', 'declined', 'expired')),
      visitor_key text,
      created_at timestamptz not null,
      decided_at timestamptz,
      decided_by uuid,
      decision_note text constraint booking_requests_decision_note_length check (decision_note is null or length(decision_note) <= 200),
      unit_id uuid references app.units (id) on delete set null,
      constraint booking_requests_stay check (leave > arrive),
      constraint booking_requests_party check (adults + children <= 12),
      constraint booking_requests_decided check ((status = 'waiting') = (decided_at is null))
    );
    create index booking_requests_waiting on app.booking_requests (arrive, created_at) where status = 'waiting';
    create index booking_requests_waiting_by_phone on app.booking_requests (phone) where status = 'waiting';
    create index booking_requests_handled on app.booking_requests (coalesce(decided_at, created_at) desc);

    alter table app.availability_blocks
      add constraint availability_blocks_request_link foreign key (request_id) references app.booking_requests (id) on delete set null;

    select app.secure_schema();
  `,
};
