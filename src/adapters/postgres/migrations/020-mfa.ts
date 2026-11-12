import type { Migration } from "../migrate";

/**
 * Authenticator apps (TOTP, RFC 6238) and one-time recovery codes (see
 * ../mfa-store.ts). The shared secret is stored encrypted with the data key
 * (AES-256-GCM, src/adapters/crypto/field-encryption.ts), never in the clear;
 * recovery codes are stored only as hashes.
 */
export const mfaMigration: Migration = {
  id: "020-mfa",
  sql: /* sql */ `
    create table app.mfa_totp (
      account_id uuid primary key references app.accounts (id) on delete cascade,
      secret_ciphertext text not null,
      -- Null while enrolment waits for the first correct code.
      confirmed_at timestamptz,
      -- The last 30-second step a code was accepted for: a code can't be used twice.
      last_used_step bigint,
      created_at timestamptz not null
    );

    create table app.mfa_recovery_codes (
      id uuid primary key,
      account_id uuid not null references app.accounts (id) on delete cascade,
      code_hash text not null,
      used_at timestamptz,
      created_at timestamptz not null
    );
    create index mfa_recovery_codes_by_account on app.mfa_recovery_codes (account_id);

    select app.secure_schema();
  `,
};
