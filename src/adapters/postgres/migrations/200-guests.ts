import type { Migration } from "../migrate";

/**
 * Guest records (see ../reservation-store.ts): who stays, and how to reach
 * them. Contact details are personal information (POPIA): only roles with
 * guests:view read them, and staff's read model never carries them. ID or
 * passport numbers aren't collected (open question #15).
 */
export const guestsMigration: Migration = {
  id: "200-guests",
  sql: /* sql */ `
    create table app.guests (
      id uuid primary key,
      name text not null constraint guests_name_length check (length(btrim(name)) between 1 and 80),
      phone text constraint guests_phone_format check (phone is null or phone ~ '^\\+[1-9][0-9]{6,14}$'),
      email text constraint guests_email_length check (email is null or length(email) <= 254),
      -- For sales and the owner only; never shown to staff.
      notes text constraint guests_notes_length check (notes is null or length(notes) <= 1000),
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create index guests_by_phone on app.guests (phone) where phone is not null;
    create index guests_by_name on app.guests (lower(name));

    select app.secure_schema();
  `,
};
