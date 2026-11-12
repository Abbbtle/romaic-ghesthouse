import "server-only";
import type { ContentStore, RevisionSummary, SectionSave, StoredRevision, StoredSection } from "@/lib/content/ports";
import { jsonParam, type Database } from "./database";

type SectionRow = { key: string; data: unknown; revision: number; updated_at: Date | null };

type RevisionRow = { key: string; revision: number; data?: unknown; saved_at: Date | null; saved_by: string | null };

const columns = "key, data, revision, updated_at";

function storedSection(row: SectionRow): StoredSection {
  return { key: row.key, data: row.data, revision: row.revision, savedAt: row.updated_at };
}

function revisionSummary(row: RevisionRow): RevisionSummary {
  return { key: row.key, revision: row.revision, savedAt: row.saved_at, savedBy: row.saved_by };
}

/**
 * The site's content in Postgres (app.content_sections and
 * app.content_revisions; see ./migrations/060-content.ts), one row per
 * section and one per saved version of it.
 *
 * Every write is one statement, so Postgres's own row locking keeps it right
 * when two servers write at once: a save only lands while the row is still
 * at the revision its editor started from, and seeding inserts only the keys
 * nobody has. Each statement writes the history row from what it actually
 * stored (a data-modifying WITH), so the section and its history can't
 * disagree, and a save that didn't land leaves no history.
 */
export function createPostgresContentStore(db: Database): ContentStore {
  return {
    async loadAll() {
      return (await db.all<SectionRow>(`select ${columns} from app.content_sections order by key`)).map(storedSection);
    },

    async load(key) {
      const row = await db.get<SectionRow>(`select ${columns} from app.content_sections where key = :key`, { key });
      return row ? storedSection(row) : null;
    },

    async save(key, data, { expectedRevision, savedBy, savedAt }): Promise<SectionSave> {
      const values = { key, data: jsonParam(data), savedBy, savedAt };
      // Revision 0 means "not stored yet": it may only be the first row for the key.
      const write =
        expectedRevision === 0
          ? `insert into app.content_sections (key, data, revision, updated_at, updated_by)
             values (:key, cast(:data as jsonb), 1, :savedAt, :savedBy)
             on conflict (key) do nothing
             returning key, revision, data, updated_at, updated_by`
          : `update app.content_sections
             set data = cast(:data as jsonb), revision = revision + 1, updated_at = :savedAt, updated_by = :savedBy
             where key = :key and revision = :expectedRevision
             returning key, revision, data, updated_at, updated_by`;
      const saved = await db.get<{ revision: number }>(
        `with saved as (${write}),
         history as (
           insert into app.content_revisions (key, revision, data, saved_at, saved_by)
           select key, revision, data, updated_at, updated_by from saved
         )
         select revision from saved`,
        expectedRevision === 0 ? values : { ...values, expectedRevision },
      );
      return saved ? { status: "saved", revision: saved.revision } : { status: "stale" };
    },

    async seedMissing(defaults) {
      // Every section in one statement: jsonb_each turns { site: {…}, seo: {…} } into (key, data) rows,
      // and each one inserted gets revision 1 in its history.
      await db.run(
        `with seeded as (
           insert into app.content_sections (key, data, revision)
           select section.key, section.value, 1 from jsonb_each(cast(:defaults as jsonb)) as section
           on conflict (key) do nothing
           returning key, data
         )
         insert into app.content_revisions (key, revision, data)
         select key, 1, data from seeded
         on conflict (key, revision) do nothing`,
        { defaults: jsonParam(defaults) },
      );
    },

    async listRevisions(key, limit) {
      const rows = await db.all<RevisionRow>(
        `select key, revision, saved_at, saved_by from app.content_revisions
         where key = :key order by revision desc limit :limit`,
        { key, limit: Math.max(0, Math.floor(limit)) },
      );
      return rows.map(revisionSummary);
    },

    async loadRevision(key, revision): Promise<StoredRevision | null> {
      if (!Number.isSafeInteger(revision)) return null;
      const row = await db.get<RevisionRow>(
        "select key, revision, data, saved_at, saved_by from app.content_revisions where key = :key and revision = :revision",
        { key, revision },
      );
      return row ? { ...revisionSummary(row), data: row.data } : null;
    },
  };
}
