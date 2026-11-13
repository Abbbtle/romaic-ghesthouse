import { isRole, roles, type Actor, type Role } from "./actor";

/**
 * The audit log as every core sees it: a port that records what someone did,
 * and one that reads it back for the audit page. The Postgres adapter keeps
 * an append-only, hash-chained table
 * (src/adapters/postgres/migrations/040-audit-log.ts); tests use the
 * in-memory log below.
 *
 * Record changes to bookings, money, roles, settings, content and sign-in.
 * Never put a password, token, secret, authenticator code, or a full card or
 * ID number in a summary or details.
 */

/** Which kind of record an entry is, which also decides who may read it (roles.md, audit:view). */
export const auditCategories = [
  "auth",
  "team",
  "content",
  "media",
  "settings",
  "contact",
  "integrations",
  "security",
  "tasks",
  "bookings",
  "guests",
  "money",
  "channels",
  "tax",
  "periods",
  "privacy",
] as const;

export type AuditCategory = (typeof auditCategories)[number];

export type AuditEvent = {
  /** Who did it; null for the system (the daily job) or someone not signed in (a failed sign-in). */
  actor: Actor | null;
  category: AuditCategory;
  /** A short machine-readable verb, such as "content.saved" or "team.member-added". */
  action: string;
  target?: { type: string; id: string };
  /**
   * The role of the account the entry is about (a team change), so a reader
   * who may manage only some roles sees only entries about those. A change
   * between two roles records the more senior one (see moreSenior).
   */
  subjectRole?: Role | null;
  /** One readable line for the audit page, such as "Saved Business details (revision 4)". */
  summary: string;
  /** Extra facts worth keeping, never secrets. */
  details?: Record<string, unknown>;
  /** The keyed hash of the visitor's IP address, when the event came from a request. */
  ipHash?: string | null;
};

export interface AuditRecorder {
  record(event: AuditEvent): Promise<void>;
}

/** Of two roles, the one higher in the order of ./actor.ts's roles (owner first). */
export function moreSenior(a: Role, b: Role): Role {
  return roles.indexOf(a) <= roles.indexOf(b) ? a : b;
}

/** An entry as it's read back. */
export type AuditEntry = {
  /** Its place in the log: later entries have higher numbers. */
  seq: number;
  id: string;
  at: Date;
  actorId: string | null;
  actorRole: Role | null;
  /** Empty for the system or someone not signed in. */
  actorName: string;
  category: AuditCategory;
  action: string;
  target: { type: string; id: string } | null;
  subjectRole: Role | null;
  summary: string;
  details: Record<string, unknown>;
};

/**
 * Which entries a reader may see: entries in `categories` and, of those
 * about an account, only the ones about `subjectRoles`. Stores apply it in
 * the query itself, so a page of entries is never thinned out afterwards.
 */
export type AuditScope = {
  categories: readonly AuditCategory[];
  subjectRoles: readonly Role[];
};

export type AuditListRequest = {
  scope: AuditScope;
  /** At most this many, newest first. */
  limit: number;
  /** Only entries older than this one, for the next page. */
  beforeSeq?: number;
};

/** Whether the chain still adds up, or the first entry where it doesn't. */
export type ChainCheck = { status: "intact"; entries: number } | { status: "broken"; atSeq: number };

/** Reading the audit log back. There's no way to change or remove an entry. */
export interface AuditLogReader {
  list(request: AuditListRequest): Promise<AuditEntry[]>;
  verifyChain(): Promise<ChainCheck>;
}

/** Whether `entry` falls inside `scope`: the rule every audit store applies. */
export function inAuditScope(scope: AuditScope, entry: Pick<AuditEntry, "category" | "subjectRole">): boolean {
  return scope.categories.includes(entry.category) && (entry.subjectRole === null || scope.subjectRoles.includes(entry.subjectRole));
}

/** An audit log that keeps events in memory, for tests: it records, lists and always checks out intact. */
export function memoryAuditRecorder(): AuditRecorder & AuditLogReader & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  const entryOf = (event: AuditEvent, index: number): AuditEntry => ({
    seq: index + 1,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    at: new Date(0),
    actorId: event.actor?.id ?? null,
    actorRole: event.actor && isRole(event.actor.role) ? event.actor.role : null,
    actorName: event.actor?.name ?? "",
    category: event.category,
    action: event.action,
    target: event.target ?? null,
    subjectRole: event.subjectRole ?? null,
    summary: event.summary,
    details: event.details ?? {},
  });
  return {
    events,
    async record(event) {
      events.push(event);
    },
    async list({ scope, limit, beforeSeq }) {
      return events
        .map(entryOf)
        .filter((entry) => inAuditScope(scope, entry) && (beforeSeq === undefined || entry.seq < beforeSeq))
        .reverse()
        .slice(0, limit);
    },
    async verifyChain() {
      return { status: "intact", entries: events.length };
    },
  };
}
