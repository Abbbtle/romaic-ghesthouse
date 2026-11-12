import type { Actor } from "@/lib/kernel/actor";
import type { SectionData, SectionKey, SectionPermission, SiteContent } from "./schema";

/**
 * What the content service needs from storage. A Postgres adapter keeps one
 * row per section (`app.content_sections`: key, data jsonb, revision, and
 * who saved it when) and one row per revision of each section
 * (`app.content_revisions`); the in-memory one in ./testing serves tests.
 * Each method is one atomic step, so an adapter can make it one statement or
 * transaction.
 */

/**
 * A section as stored. `data` is whatever was saved, possibly by an older
 * release, so the service checks it again on every read. `key` is a string
 * because storage may still hold a section this release no longer knows.
 */
export type StoredSection = {
  key: string;
  data: unknown;
  /** Goes up by one with every save; 1 for a seeded default. */
  revision: number;
  /** When someone last saved it from the dashboard; null while it's still the default it was seeded with. */
  savedAt: Date | null;
};

/** A save's terms: only over `expectedRevision` (0: not stored yet), recorded as by `savedBy` (an account id) at `savedAt`. */
export type SectionWrite = {
  expectedRevision: number;
  savedBy: string;
  savedAt: Date;
};

/** A conditional save's outcome: saved at the new revision, or refused because someone saved first. */
export type SectionSave = { status: "saved"; revision: number } | { status: "stale" };

/** One version of a section as it was saved: the seed (revision 1, saved by nobody) or a save from the dashboard. */
export type StoredRevision = {
  key: string;
  revision: number;
  data: unknown;
  /** Null for the seeded default. */
  savedAt: Date | null;
  /** The account that saved it; null for the seeded default. */
  savedBy: string | null;
};

/** A revision as a history list shows it, without its content. */
export type RevisionSummary = Omit<StoredRevision, "data">;

export interface ContentStore {
  /** Every stored section. */
  loadAll(): Promise<StoredSection[]>;

  load(key: SectionKey): Promise<StoredSection | null>;

  /**
   * Saves `data` as the section's new content, but only while the section is
   * still at `write.expectedRevision`, recording who saved it and when, and
   * keeps a copy as that revision in the section's history, all at once.
   * Otherwise changes nothing and answers "stale".
   */
  save<K extends SectionKey>(key: K, data: SectionData<K>, write: SectionWrite): Promise<SectionSave>;

  /**
   * Stores each section of `defaults` that isn't stored yet, at revision 1
   * and saved by nobody, with that revision in its history, and never
   * touches one that is. Safe to run on many servers at once.
   */
  seedMissing(defaults: SiteContent): Promise<void>;

  /** A section's history, newest first, at most `limit` revisions. */
  listRevisions(key: SectionKey, limit: number): Promise<RevisionSummary[]>;

  /** One revision of a section, or null when there's no such revision. */
  loadRevision(key: SectionKey, revision: number): Promise<StoredRevision | null>;
}

/**
 * Who may do what, as the content service asks it: the accounts core's
 * permission checks (can and assertCan), wired in by src/server/content.ts.
 * assertCan throws the accounts core's NotAllowedError, which dashboard
 * actions turn into a message.
 */
export interface ContentAccess {
  can(actor: Actor, permission: SectionPermission): boolean;
  assertCan(actor: Actor, permission: SectionPermission): void;
}
