import type { Migration } from "../migrate";

/**
 * The audit log (see ../audit-store.ts): who did what, when, to bookings,
 * money, roles, settings, content and sign-in. Append-only: rows can't be
 * changed or deleted, by trigger for everyone and by privilege for the
 * runtime role. Each row carries a SHA-256 of the previous row's hash and
 * its own content (prev_hash, row_hash), so a gap or an edit made by someone
 * with owner access to the database shows up when the chain is checked.
 *
 * `category` and `subject_role` decide who may read an entry (roles.md,
 * audit:view; src/lib/accounts/audit-log-service.ts): admins see content,
 * media, site settings, integrations and changes to staff accounts, never
 * money, bookings or tax.
 */
export const auditLogMigration: Migration = {
  id: "040-audit-log",
  sql: /* sql */ `
    create table app.audit_log (
      seq bigint generated always as identity primary key,
      id uuid not null constraint audit_log_id_unique unique,
      at timestamptz not null,
      actor_id uuid,
      actor_role text,
      actor_name text not null default '',
      category text not null constraint audit_log_category_known check (category in (
        'auth', 'team', 'content', 'media', 'settings', 'contact', 'integrations', 'security',
        'tasks', 'bookings', 'guests', 'money', 'channels', 'tax', 'periods', 'privacy'
      )),
      action text not null,
      target_type text,
      target_id text,
      -- The role of the account an entry is about (a team change), for who may read it.
      subject_role text constraint audit_log_subject_role_known check (subject_role in ('owner', 'admin', 'sales', 'staff')),
      -- One readable line; never a password, token, secret or full card or ID number.
      summary text not null,
      details jsonb not null default '{}' constraint audit_log_details_is_object check (jsonb_typeof(details) = 'object'),
      ip_hash text,
      prev_hash text not null,
      row_hash text not null constraint audit_log_row_hash_unique unique
    );
    create index audit_log_by_time on app.audit_log (at desc);
    create index audit_log_by_category on app.audit_log (category, at desc);
    create index audit_log_by_actor on app.audit_log (actor_id, at desc);

    select app.make_append_only('app.audit_log');
    select app.secure_schema();
  `,
};
