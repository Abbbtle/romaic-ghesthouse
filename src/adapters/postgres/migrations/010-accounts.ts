import type { Migration } from "../migrate";

/**
 * Dashboard accounts and their sessions (see ../account-stores.ts).
 *
 * Constraint names are part of the contract: the stores recognise
 * accounts_email_unique when it refuses a write.
 */
export const accountsMigration: Migration = {
  id: "010-accounts",
  sql: /* sql */ `
    create table app.accounts (
      id uuid primary key,
      -- Stored in lower case, so one address is one account however it's typed.
      email text not null
        constraint accounts_email_unique unique
        constraint accounts_email_lower_case check (email = lower(email)),
      name text not null,
      role text not null constraint accounts_role_known check (role in ('owner', 'admin', 'sales', 'staff')),
      -- Disabled accounts can't sign in; their records stay, so the audit trail keeps their name.
      status text not null default 'active' constraint accounts_status_known check (status in ('active', 'disabled')),
      password_hash text not null,
      -- Set while the account has a temporary password (from the team page or the reset script):
      -- it must choose its own before it can use the dashboard, and the temporary one expires.
      must_change_password boolean not null default false,
      temporary_password_expires_at timestamptz,
      -- When the owner proved they receive mail at this address; password reset links go only to
      -- a verified address.
      email_verified_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      last_signed_in_at timestamptz,
      constraint accounts_temporary_password_expiry check (must_change_password or temporary_password_expires_at is null)
    );

    -- A signed-in browser. Only a SHA-256 hash of its cookie's token is kept, so reading this
    -- table doesn't let anyone sign in. A session ends at whichever comes first: its idle expiry
    -- (moved on as it's used) or its absolute expiry (fixed at sign-in).
    create table app.sessions (
      token_hash text primary key,
      account_id uuid not null references app.accounts (id) on delete cascade,
      created_at timestamptz not null,
      idle_expires_at timestamptz not null,
      absolute_expires_at timestamptz not null,
      -- When the idle expiry last moved, so requests arriving together extend it once.
      last_extended_at timestamptz not null,
      -- When this session passed the authenticator step; null until it has (or for accounts
      -- that don't use one, set at sign-in).
      mfa_verified_at timestamptz,
      -- When the password and code were last re-entered, for actions that ask again.
      step_up_at timestamptz,
      -- A short description of the browser for the session list ("Safari on iPhone").
      device text not null default '',
      constraint sessions_absolute_after_creation check (absolute_expires_at > created_at)
    );
    create index sessions_by_account on app.sessions (account_id);
    create index sessions_by_expiry on app.sessions (idle_expires_at);

    select app.secure_schema();
  `,
};
