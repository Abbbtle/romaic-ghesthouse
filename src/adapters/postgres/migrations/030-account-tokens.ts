import type { Migration } from "../migrate";

/**
 * Single-use links sent by email: an owner's password reset, and proving an
 * email address before resets may go to it (see ../account-stores.ts). Only
 * a hash of each token is kept; each one names the address it was sent to,
 * so a link stops working if the account's address changes.
 */
export const accountTokensMigration: Migration = {
  id: "030-account-tokens",
  sql: /* sql */ `
    create table app.account_tokens (
      token_hash text primary key,
      account_id uuid not null references app.accounts (id) on delete cascade,
      purpose text not null constraint account_tokens_purpose_known check (purpose in ('password-reset', 'email-verification')),
      email text not null,
      created_at timestamptz not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      constraint account_tokens_expiry_after_creation check (expires_at > created_at)
    );
    create index account_tokens_by_account on app.account_tokens (account_id, purpose);
    create index account_tokens_by_expiry on app.account_tokens (expires_at);

    select app.secure_schema();
  `,
};
