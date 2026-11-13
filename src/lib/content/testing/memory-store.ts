import type { ContentStore, RevisionSummary, SectionSave, StoredRevision, StoredSection } from "../ports";
import { sectionKeys } from "../schema";

/** A section an older release stored, to start a memory store with: saved by nobody unless `savedAt` says otherwise. */
export type StoredSectionFixture = Omit<StoredSection, "savedAt"> & { savedAt?: Date | null };

type Kept = { data: unknown; revision: number; savedAt: Date | null };

/**
 * A ContentStore in memory, for tests. It behaves like the Postgres one:
 * data is copied in and out as JSON (as jsonb would), saves are conditional
 * on the revision and keep a copy in the section's history, and seeding
 * never overwrites. Start it with `initial` sections to test reading what an
 * older release saved (those have no history, as if saved before it existed).
 */
export function createMemoryContentStore(initial: readonly StoredSectionFixture[] = []): ContentStore {
  const sections = new Map<string, Kept>();
  const history = new Map<string, StoredRevision[]>();
  for (const section of initial) {
    sections.set(section.key, { data: jsonCopy(section.data), revision: section.revision, savedAt: dateCopy(section.savedAt ?? null) });
  }

  const stored = (key: string): StoredSection | null => {
    const section = sections.get(key);
    return section ? { key, data: jsonCopy(section.data), revision: section.revision, savedAt: dateCopy(section.savedAt) } : null;
  };

  const remember = (revision: StoredRevision) => {
    const list = history.get(revision.key) ?? [];
    if (list.some((kept) => kept.revision === revision.revision)) return;
    list.push({ ...revision, data: jsonCopy(revision.data), savedAt: dateCopy(revision.savedAt) });
    history.set(revision.key, list);
  };

  return {
    async loadAll() {
      return [...sections.keys()].flatMap((key) => stored(key) ?? []);
    },

    async load(key) {
      return stored(key);
    },

    async save(key, data, { expectedRevision, savedAt, savedBy }): Promise<SectionSave> {
      const revision = sections.get(key)?.revision ?? 0;
      if (revision !== expectedRevision) return { status: "stale" };
      sections.set(key, { data: jsonCopy(data), revision: revision + 1, savedAt: dateCopy(savedAt) });
      remember({ key, revision: revision + 1, data, savedAt, savedBy });
      return { status: "saved", revision: revision + 1 };
    },

    async seedMissing(defaults) {
      for (const key of sectionKeys) {
        if (sections.has(key)) continue;
        sections.set(key, { data: jsonCopy(defaults[key]), revision: 1, savedAt: null });
        remember({ key, revision: 1, data: defaults[key], savedAt: null, savedBy: null });
      }
    },

    async listRevisions(key, limit): Promise<RevisionSummary[]> {
      return [...(history.get(key) ?? [])]
        .sort((a, b) => b.revision - a.revision)
        .slice(0, Math.max(0, limit))
        .map(({ key: sectionKey, revision, savedAt, savedBy }) => ({ key: sectionKey, revision, savedAt: dateCopy(savedAt), savedBy }));
    },

    async loadRevision(key, revision) {
      const kept = history.get(key)?.find((item) => item.revision === revision);
      return kept ? { ...kept, data: jsonCopy(kept.data), savedAt: dateCopy(kept.savedAt) } : null;
    },
  };
}

function dateCopy(date: Date | null): Date | null {
  return date && new Date(date);
}

function jsonCopy(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
