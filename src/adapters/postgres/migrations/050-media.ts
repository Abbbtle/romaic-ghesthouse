import type { Migration } from "../migrate";

/**
 * Files. Public images (app.media), served by /media/<id> to anyone and
 * cached for a year, since a stored image never changes: replacing one
 * stores a new image with a new id. Private files (app.private_files):
 * receipts, proof of submission, task photos and documents, served only by
 * the dashboard after a permission check for the file's purpose, never
 * cached by shared caches (see ../media-store.ts and src/server/media.ts).
 */
export const mediaMigration: Migration = {
  id: "050-media",
  sql: /* sql */ `
    create table app.media (
      id uuid primary key,
      content_type text not null
        constraint media_content_type_known check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
      width integer not null constraint media_width_in_range check (width between 1 and 8192),
      height integer not null constraint media_height_in_range check (height between 1 and 8192),
      byte_size integer not null,
      -- Hex SHA-256 of the bytes, sent as the response's ETag.
      sha256 text not null,
      bytes bytea not null,
      created_at timestamptz not null,
      -- Who uploaded it; kept when that person leaves the team.
      created_by uuid references app.accounts (id) on delete set null,
      constraint media_byte_size_matches check (byte_size = octet_length(bytes))
    );
    -- Photos arrive compressed, so Postgres stores them as they are rather than trying again.
    alter table app.media alter column bytes set storage external;

    create table app.private_files (
      id uuid primary key,
      purpose text not null constraint private_files_purpose_known check (purpose in ('receipt', 'proof-of-submission', 'task-photo', 'document')),
      file_name text not null constraint private_files_file_name_length check (char_length(file_name) between 1 and 200),
      content_type text not null
        constraint private_files_content_type_known check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
      byte_size integer not null,
      sha256 text not null,
      bytes bytea not null,
      created_at timestamptz not null,
      created_by uuid references app.accounts (id) on delete set null,
      constraint private_files_byte_size_matches check (byte_size = octet_length(bytes))
    );
    alter table app.private_files alter column bytes set storage external;

    select app.secure_schema();
  `,
};
