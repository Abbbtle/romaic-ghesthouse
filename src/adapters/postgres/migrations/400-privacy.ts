import type { Migration } from "../migrate";

/**
 * POPIA (Phase 5; see ../privacy-store.ts and src/lib/privacy). Owner only,
 * through the privacy service.
 *
 * - app.privacy_requests: the data-subject request log. Who asked is kept
 *   short; their contact is sealed with DATA_ENCRYPTION_KEY (AES-256-GCM,
 *   bound to the request's id), with only a masked hint in the clear. A
 *   register: rows are never deleted (DELETE and TRUNCATE refused by
 *   trigger); their status, notes and outcome change as the request is
 *   worked.
 * - app.privacy_breaches: the breach register. Never deleted either.
 * - app.privacy_officer: the Information Officer's details, one row.
 * - app.retention_policies: each version of each retention rule the owner
 *   set or confirmed. Append-only: a change is a new version.
 * - app.retention_runs: each run of the daily retention job, as counts
 *   only. Append-only.
 * - app.guests gains anonymised_at: when the retention job (or a request)
 *   anonymised the guest. Bookings keep pointing at the guest; only the
 *   guest's details (and their bookings' free-text notes) are cleared.
 *   Additive, so the previous release's code is unaffected.
 */
export const privacyMigration: Migration = {
  id: "400-privacy",
  sql: /* sql */ `
    alter table app.guests add column anonymised_at timestamptz;

    create function app.forbid_register_delete() returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'app.% is a register: its entries are never deleted', tg_table_name using errcode = 'insufficient_privilege';
    end
    $$;

    create table app.privacy_requests (
      id uuid primary key,
      kind text not null constraint privacy_requests_kind check (kind in ('access', 'correction', 'deletion', 'objection', 'other')),
      requester_name text not null constraint privacy_requests_name_length check (length(btrim(requester_name)) between 1 and 80),
      contact_sealed text constraint privacy_requests_contact_length check (contact_sealed is null or length(contact_sealed) <= 2000),
      contact_hint text constraint privacy_requests_hint_length check (contact_hint is null or length(contact_hint) <= 120),
      received_on date not null,
      due_on date not null,
      status text not null constraint privacy_requests_status check (status in ('received', 'in-progress', 'answered', 'refused')),
      details text constraint privacy_requests_details_length check (details is null or length(details) <= 1000),
      notes text constraint privacy_requests_notes_length check (notes is null or length(notes) <= 2000),
      guest_id uuid references app.guests (id) on delete set null,
      identity_confirmed_on date,
      identity_note text constraint privacy_requests_identity_note_length check (identity_note is null or length(identity_note) <= 300),
      closed_on date,
      outcome text constraint privacy_requests_outcome_length check (outcome is null or length(outcome) <= 2000),
      created_by uuid,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      revision integer not null default 1 constraint privacy_requests_revision_positive check (revision >= 1),
      constraint privacy_requests_contact_pair check ((contact_sealed is null) = (contact_hint is null)),
      constraint privacy_requests_due_after_received check (due_on >= received_on),
      constraint privacy_requests_closed check ((status in ('answered', 'refused')) = (closed_on is not null)),
      constraint privacy_requests_refusal_reason check (status <> 'refused' or outcome is not null),
      constraint privacy_requests_identity_pair check ((identity_confirmed_on is null) = (identity_note is null))
    );
    create index privacy_requests_open_by_due on app.privacy_requests (due_on) where status in ('received', 'in-progress');
    create trigger privacy_requests_keep_rows before delete on app.privacy_requests for each row execute function app.forbid_register_delete();
    create trigger privacy_requests_keep_table before truncate on app.privacy_requests for each statement execute function app.forbid_register_delete();

    create table app.privacy_breaches (
      id uuid primary key,
      discovered_on date not null,
      summary text not null constraint privacy_breaches_summary_length check (length(btrim(summary)) between 1 and 2000),
      data_involved text not null constraint privacy_breaches_data_length check (length(btrim(data_involved)) between 1 and 1000),
      people_affected integer constraint privacy_breaches_people check (people_affected is null or people_affected between 0 and 10000000),
      status text not null constraint privacy_breaches_status check (status in ('ongoing', 'contained')),
      contained_on date,
      regulator_told_on date,
      regulator_reference text constraint privacy_breaches_reference_length check (regulator_reference is null or length(regulator_reference) <= 80),
      people_told_on date,
      people_told_how text constraint privacy_breaches_told_how_length check (people_told_how is null or length(people_told_how) <= 300),
      actions text constraint privacy_breaches_actions_length check (actions is null or length(actions) <= 4000),
      created_by uuid,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      revision integer not null default 1 constraint privacy_breaches_revision_positive check (revision >= 1),
      constraint privacy_breaches_contained check ((status = 'contained') = (contained_on is not null)),
      constraint privacy_breaches_dates check (
        (contained_on is null or contained_on >= discovered_on)
        and (regulator_told_on is null or regulator_told_on >= discovered_on)
        and (people_told_on is null or people_told_on >= discovered_on)
      )
    );
    create trigger privacy_breaches_keep_rows before delete on app.privacy_breaches for each row execute function app.forbid_register_delete();
    create trigger privacy_breaches_keep_table before truncate on app.privacy_breaches for each statement execute function app.forbid_register_delete();

    create table app.privacy_officer (
      id smallint primary key default 1 constraint privacy_officer_one_row check (id = 1),
      name text not null constraint privacy_officer_name_length check (length(btrim(name)) between 2 and 80),
      email text not null constraint privacy_officer_email_length check (length(email) between 3 and 254),
      phone text constraint privacy_officer_phone_format check (phone is null or phone ~ '^\\+[1-9][0-9]{6,14}$'),
      registration_reference text constraint privacy_officer_reference_length check (registration_reference is null or length(registration_reference) <= 40),
      updated_at timestamptz not null,
      updated_by uuid
    );

    create table app.retention_policies (
      id uuid primary key,
      kind text not null constraint retention_policies_kind check (
        kind in ('guest-records', 'task-photos', 'booking-requests', 'bookings-invoices', 'audit-log', 'visitor-keys', 'sessions')
      ),
      version integer not null constraint retention_policies_version_positive check (version >= 1),
      period integer constraint retention_policies_period check (period is null or period between 1 and 1200),
      set_by uuid not null,
      set_by_name text not null constraint retention_policies_set_by_name_length check (length(set_by_name) between 1 and 80),
      set_at timestamptz not null,
      constraint retention_policies_version_unique unique (kind, version),
      constraint retention_policies_period_kind check ((kind in ('guest-records', 'task-photos')) = (period is not null))
    );
    select app.make_append_only('app.retention_policies');

    create table app.retention_runs (
      id uuid primary key,
      ran_at timestamptz not null,
      guests_anonymised integer not null constraint retention_runs_guests check (guests_anonymised >= 0),
      photos_deleted integer not null constraint retention_runs_photos check (photos_deleted >= 0),
      -- Why a rule didn't run, in words; never anyone's details.
      skipped jsonb not null default '[]' constraint retention_runs_skipped_array check (jsonb_typeof(skipped) = 'array')
    );
    create index retention_runs_by_time on app.retention_runs (ran_at desc);
    select app.make_append_only('app.retention_runs');

    select app.secure_schema();
  `,
};
