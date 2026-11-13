import type { Migration } from "../migrate";

/**
 * The site's editable content (see ../content-store.ts): one row per section
 * ("site", "contact", "seo", "privacy" and, from Phase 2, each page), holding
 * the whole section as JSON. Each save moves the revision on by one, and only
 * lands over the revision the editor started from, so two people editing the
 * same section can't overwrite each other unseen.
 *
 * Every save also keeps a copy in app.content_revisions, so any earlier
 * version can be viewed and restored (restoring saves it again as a new
 * revision; history is never rewritten).
 *
 * updated_by and saved_by hold the account id of whoever saved, deliberately
 * not a foreign key: someone leaving the team doesn't rewrite what they
 * published.
 */
export const contentMigration: Migration = {
  id: "060-content",
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

    create table app.content_revisions (
      key text not null,
      revision integer not null constraint content_revisions_revision_positive check (revision >= 1),
      data jsonb not null constraint content_revisions_data_is_object check (jsonb_typeof(data) = 'object'),
      saved_at timestamptz,
      saved_by uuid,
      primary key (key, revision)
    );
    create index content_revisions_by_key on app.content_revisions (key, revision desc);

    select app.secure_schema();
  `,
};
