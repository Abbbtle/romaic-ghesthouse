import type { Migration } from "../migrate";

/**
 * The site's editable content (see ../content-store.ts): one row per section
 * ("home", "pricing", …), holding the whole section as JSON. Each save moves
 * the revision on by one, and only lands over the revision the editor
 * started from, so two people editing the same section can't overwrite each
 * other unseen.
 *
 * Keys aren't limited to today's sections: a section a later release drops
 * stays readable (the content service ignores it). updated_by holds the
 * account id of whoever last saved, deliberately not a foreign key: someone
 * leaving the team doesn't rewrite what they published, and the diary's
 * actor columns work the same way (./040-diary.ts).
 */
export const contentMigration: Migration = {
  id: "030-content",
  sql: /* sql */ `
    create table app.content_sections (
      key text primary key,
      data jsonb not null constraint content_sections_data_is_object check (jsonb_typeof(data) = 'object'),
      -- 1 for a seeded default; up by one with every save.
      revision integer not null constraint content_sections_revision_positive check (revision >= 1),
      -- When someone last saved it from the dashboard, and who: both null while it's still the default it was seeded with.
      updated_at timestamptz,
      updated_by uuid,
      constraint content_sections_saved_by_someone check ((updated_at is null) = (updated_by is null))
    );

    select app.secure_schema();
  `,
};
