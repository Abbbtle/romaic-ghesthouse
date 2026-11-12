import { zonedToday } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult, type FieldErrors } from "@/lib/kernel/result";
import type { ContentAccess, ContentStore, RevisionSummary, StoredSection } from "./ports";
import { isSectionKey, parseSection, sectionKeys, sectionNames, sectionPermissions, type SectionData, type SectionKey, type SiteContent } from "./schema";
import { reviseSection } from "./versioning";

export const staleSectionMessage = "Someone else saved this section while you were editing. Reload to see their changes.";

export const unknownSectionMessage = "That part of the site doesn't exist. Reload the page.";

/** For a save whose revision can't be one the service handed out. */
export const reloadSectionMessage = "Reload the page and try again.";

export const unknownRevisionMessage = "That version isn't in this section's history any more. Reload the page.";

/** A version saved by an older release that today's site can't show. */
export const unreadableRevisionMessage = "That version can't be restored: it was saved in a form this site no longer reads.";

/** How many earlier versions the history shows. */
export const historyLimit = 50;

/** A stored section that no longer validates. The site shows the default until someone saves it again. */
export type InvalidStoredSection = { key: SectionKey; revision: number; errors: FieldErrors };

export type ContentServiceDependencies = {
  store: ContentStore;
  /** The seed content (src/content). Stored the first time the service is used; after that, storage is the source of truth. */
  defaults: SiteContent;
  clock: Clock;
  /** The business's time zone, for the date a privacy notice was last updated. */
  timeZone: string;
  /** Records each save and restore in the audit log. */
  audit: AuditRecorder;
  /** Who may edit which section: the accounts core's permission checks. */
  access: ContentAccess;
  /** Told once per stored revision that doesn't validate, so it can be logged. */
  onInvalidSection?: (problem: InvalidStoredSection) => void;
};

export type EditableSection<K extends SectionKey> = {
  data: SectionData<K>;
  /** Send it back with the save: a save over a newer one is refused. */
  revision: number;
  /** The saved version couldn't be read, so `data` is the default. Saving replaces it. */
  recovered: boolean;
  /** When someone last saved it; null while it's still the default the site started with. */
  savedAt: Date | null;
};

/** A section as the dashboard lists it: when it was last saved, and whether its saved version can't be read. */
export type SectionSummary = Omit<EditableSection<SectionKey>, "data"> & { key: SectionKey };

/** An earlier version of a section, for the history page: its content as today's site reads it, or why it can't be read. */
export type SectionRevisionView<K extends SectionKey> = RevisionSummary & {
  key: K;
  /** The version's content laid over today's defaults, or null when it no longer validates. */
  data: SectionData<K> | null;
  /** Whether this is the version the site shows now. */
  current: boolean;
};

/**
 * Reads and saves the site's content. Reading for the public site needs no
 * actor and never fails on bad content: a stored section that doesn't
 * validate (say, saved by an older release) is replaced by its default and
 * reported, so the public site always renders. Everything the dashboard
 * does names its actor, who must hold the section's permission
 * (sectionPermissions): business details, search results and the privacy
 * notice are site content; contact details are the owner's alone.
 *
 * Saving validates the whole section and only succeeds over the revision
 * the editor started from. Every save keeps the version in the section's
 * history, and restoring an earlier version saves it again as a new
 * revision, so history is never rewritten. Saves and restores are recorded
 * in the audit log with the fields that changed, never their values.
 */
export function createContentService(deps: ContentServiceDependencies) {
  const defaults = validatedDefaults(deps.defaults);
  const can = (actor: Actor, key: SectionKey) => deps.access.can(actor, sectionPermissions[key]);
  const assertCan = (actor: Actor, key: SectionKey) => deps.access.assertCan(actor, sectionPermissions[key]);
  const reported = new Set<string>();
  let seeding: Promise<void> | null = null;

  /** Stores the defaults the first time the service is used. A failure is retried on the next call. */
  function seeded(): Promise<void> {
    seeding ??= deps.store.seedMissing(defaults).catch((error: unknown) => {
      seeding = null;
      throw error;
    });
    return seeding;
  }

  function reportInvalid(problem: InvalidStoredSection): void {
    const id = `${problem.key}@${problem.revision}`;
    if (reported.has(id)) return;
    reported.add(id);
    deps.onInvalidSection?.(problem);
  }

  /** The default for a section, as a copy: callers may change what they're given. */
  function defaultOf<K extends SectionKey>(key: K): SectionData<K> {
    return structuredClone(defaults[key]);
  }

  /** Stored data as today's site reads it: laid over the defaults, then validated. */
  function readData<K extends SectionKey>(key: K, data: unknown) {
    return parseSection(key, withDefaults(defaults[key], data));
  }

  function read<K extends SectionKey>(key: K, stored: StoredSection | null | undefined): EditableSection<K> {
    if (!stored) return { data: defaultOf(key), revision: 0, recovered: false, savedAt: null };
    const { revision, savedAt } = stored;
    const parsed = readData(key, stored.data);
    if (parsed.ok) return { data: parsed.value, revision, recovered: false, savedAt };
    reportInvalid({ key, revision, errors: parsed.errors });
    return { data: defaultOf(key), revision, recovered: true, savedAt };
  }

  /** Every stored section, by key. */
  async function storedSections(): Promise<Map<string, StoredSection>> {
    await seeded();
    return new Map((await deps.store.loadAll()).map((section) => [section.key, section]));
  }

  async function editable<K extends SectionKey>(key: K): Promise<EditableSection<K>> {
    await seeded();
    return read(key, await deps.store.load(key));
  }

  /**
   * Saves `next` (already validated) over `expectedRevision`, moving the
   * versions of agreed text on, and records it in the audit log.
   */
  async function store<K extends SectionKey>(
    actor: Actor,
    key: K,
    current: EditableSection<K>,
    next: SectionData<K>,
    audit: { action: "content.saved" | "content.restored"; restoredFrom?: number },
  ): Promise<ChangeResult<{ revision: number }>> {
    const expectedRevision = current.revision;
    const now = deps.clock.now();
    const revised = reviseSection(key, current.data, next, zonedToday(now, deps.timeZone));
    const saved = await deps.store.save(key, revised, { expectedRevision, savedBy: actor.id, savedAt: now });
    if (saved.status !== "saved") return refusedWith(staleSectionMessage);

    const changedFields = changedPaths(current.data, revised);
    await deps.audit.record({
      actor,
      category: key === "contact" ? "contact" : "content",
      action: audit.action,
      target: { type: "content-section", id: key },
      summary:
        audit.action === "content.restored"
          ? `Restored ${sectionNames[key]} to revision ${audit.restoredFrom} (now revision ${saved.revision})`
          : `Saved ${sectionNames[key]} (revision ${saved.revision})`,
      details: {
        revision: saved.revision,
        changedFields,
        ...(audit.restoredFrom === undefined ? {} : { restoredFrom: audit.restoredFrom }),
      },
    });
    return done({ revision: saved.revision });
  }

  function expectedRevisionProblem(expectedRevision: number): boolean {
    return !Number.isSafeInteger(expectedRevision) || expectedRevision < 0;
  }

  return {
    /** Every section, as the public site shows it. */
    async getAll(): Promise<SiteContent> {
      const stored = await storedSections();
      return eachSection((key) => read(key, stored.get(key)).data);
    },

    /** One section, as the public site shows it. */
    async getSection<K extends SectionKey>(key: K): Promise<SectionData<K>> {
      return (await editable(key)).data;
    },

    /** The sections `actor` may edit, in the order the dashboard lists them, with when each was last saved. */
    async getSummaries(actor: Actor): Promise<SectionSummary[]> {
      const stored = await storedSections();
      return sectionKeys
        .filter((key) => can(actor, key))
        .map((key) => {
          const { revision, recovered, savedAt } = read(key, stored.get(key));
          return { key, revision, recovered, savedAt };
        });
    },

    /** A section with the revision its editor must send back. */
    async getEditable<K extends SectionKey>(actor: Actor, key: K): Promise<EditableSection<K>> {
      assertCan(actor, key);
      return editable(key);
    },

    /**
     * Saves a whole section from untrusted input: `key` and `input` as they
     * arrived, `expectedRevision` from the editor. Problems come back keyed by
     * dotted path ("address.city"); a save over someone else's is refused.
     */
    async saveSection(actor: Actor, key: string, input: unknown, expectedRevision: number): Promise<ChangeResult<{ revision: number }>> {
      if (!isSectionKey(key)) return refusedWith(unknownSectionMessage);
      assertCan(actor, key);
      if (expectedRevisionProblem(expectedRevision)) return refusedWith(reloadSectionMessage);
      // Said before any problems with the input, so nobody fixes those only to be told to reload.
      // The store checks the revision again as it writes.
      const current = await editable(key);
      if (current.revision !== expectedRevision) return refusedWith(staleSectionMessage);
      const parsed = parseSection(key, input);
      if (!parsed.ok) return refused(parsed.errors);
      return store(actor, key, current, parsed.value, { action: "content.saved" });
    },

    /** A section's history, newest first: its revisions, when and by whom each was saved. */
    async listRevisions(actor: Actor, key: SectionKey): Promise<RevisionSummary[]> {
      assertCan(actor, key);
      await seeded();
      return deps.store.listRevisions(key, historyLimit);
    },

    /** One earlier version of a section, as today's site would show it, or null when there's no such revision. */
    async getRevision<K extends SectionKey>(actor: Actor, key: K, revision: number): Promise<SectionRevisionView<K> | null> {
      assertCan(actor, key);
      if (!Number.isSafeInteger(revision) || revision < 1) return null;
      await seeded();
      const [stored, current] = await Promise.all([deps.store.loadRevision(key, revision), deps.store.load(key)]);
      if (!stored) return null;
      const parsed = readData(key, stored.data);
      return {
        key,
        revision: stored.revision,
        savedAt: stored.savedAt,
        savedBy: stored.savedBy,
        data: parsed.ok ? parsed.value : null,
        current: current?.revision === stored.revision,
      };
    },

    /**
     * Puts an earlier version back: saves its content again as a new
     * revision, over the revision the person was looking at. The version is
     * checked as today's site reads it, so one an older release saved in a
     * form that no longer validates can't come back.
     */
    async restoreRevision(actor: Actor, key: string, revision: number, expectedRevision: number): Promise<ChangeResult<{ revision: number }>> {
      if (!isSectionKey(key)) return refusedWith(unknownSectionMessage);
      assertCan(actor, key);
      if (expectedRevisionProblem(expectedRevision) || !Number.isSafeInteger(revision) || revision < 1) return refusedWith(reloadSectionMessage);
      const current = await editable(key);
      if (current.revision !== expectedRevision) return refusedWith(staleSectionMessage);
      const stored = await deps.store.loadRevision(key, revision);
      if (!stored) return refusedWith(unknownRevisionMessage);
      const parsed = readData(key, stored.data);
      if (!parsed.ok) return refusedWith(unreadableRevisionMessage);
      return store(actor, key, current, parsed.value, { action: "content.restored", restoredFrom: revision });
    },
  };
}

export type ContentService = ReturnType<typeof createContentService>;

/** The defaults as validated, or an error naming the section that isn't: a bad seed should fail loudly. */
function validatedDefaults(defaults: SiteContent): SiteContent {
  return eachSection((key) => {
    const parsed = parseSection(key, defaults[key]);
    if (!parsed.ok) throw new Error(`The default content for "${key}" isn't valid: ${JSON.stringify(parsed.errors)}`);
    return parsed.value;
  });
}

/** Content built section by section. Every key is listed, so the result's type stays exact without a cast. */
function eachSection(section: <K extends SectionKey>(key: K) => SectionData<K>): SiteContent {
  return {
    site: section("site"),
    contact: section("contact"),
    seo: section("seo"),
    privacy: section("privacy"),
  };
}

const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Stored data laid over the defaults, so a section saved before a field
 * existed takes that field's default instead of failing to validate.
 * Objects merge key by key; everything else (text, numbers, lists, null) is
 * taken as stored. Keys the schema doesn't know are dropped when it's parsed.
 */
function withDefaults(defaults: unknown, stored: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) return stored;
  const merged: Record<string, unknown> = { ...defaults };
  for (const [name, value] of Object.entries(stored)) {
    if (unsafeKeys.has(name)) continue;
    merged[name] = Object.hasOwn(defaults, name) ? withDefaults(defaults[name], value) : value;
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The most changed fields an audit entry lists; past this it says how many more. */
const changedPathLimit = 30;

/**
 * Which fields differ between two versions of a section, by dotted path
 * ("address.city"), for the audit log: objects are compared field by
 * field, anything else (text, lists, null) as a whole. Never the values,
 * which can be contact details.
 */
export function changedPaths(before: unknown, after: unknown, path = ""): string[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const paths = keys.flatMap((key) => changedPaths(before[key], after[key], path ? `${path}.${key}` : key));
    return path ? paths : limited(paths);
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [path || "(whole section)"];
}

function limited(paths: string[]): string[] {
  return paths.length <= changedPathLimit ? paths : [...paths.slice(0, changedPathLimit), `…and ${paths.length - changedPathLimit} more`];
}
