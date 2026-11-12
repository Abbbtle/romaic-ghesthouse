import type { Migration } from "../migrate";

/**
 * Uploaded images, served by /media/<id> (see ../media-store.ts). An image
 * never changes once stored: replacing one stores a new image with a new id,
 * so its URL can be cached for a year.
 */
export const mediaMigration: Migration = {
  id: "020-media",
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

    select app.secure_schema();
  `,
};
