import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isRole, type Role } from "@/lib/kernel/actor";
import type { AuditCategory, AuditEntry, AuditEvent, AuditLogReader, AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { jsonParam, type Database } from "./database";
import { advisoryLocks } from "./locks";

/**
 * The audit log over Postgres (app.audit_log; see ./migrations/040-audit-log.ts).
 *
 * Each entry is appended inside a transaction that takes the audit lock, reads
 * the newest entry's hash and chains onto it, so entries arriving together
 * still form one unbroken chain. The table refuses updates and deletes, so
 * there is nothing here to change an entry.
 *
 * Each entry's row_hash is an HMAC-SHA256 of its predecessor's row_hash and
 * every field it stores, under a key the database never holds:
 * "hmac1.<key id>.<hex>". Someone with owner access to the database can turn
 * the append-only trigger off and edit or remove rows, but can't recompute
 * the hashes that would make the change check out. New entries use the first
 * key; any listed key verifies, so keys rotate the way data keys do (and an
 * entry whose key is no longer listed stops checking out). Entries removed
 * from the end of the log still can't be told apart from a log that ended
 * there: only a record of the newest entry kept outside the database could.
 *
 * Entries written before entries were keyed carry a plain SHA-256 instead
 * (entryHash), which anyone can recompute. They check out only as an
 * unbroken run at the start of the chain with a keyed entry after them, whose
 * HMAC covers the last one's hash and, through it, every one before.
 */

/** The audit log, both ways: entries go in, and come back out for the audit page. Never changed or removed. */
export type AuditStore = AuditRecorder & AuditLogReader;

/** The hash a chain starts from. */
export const genesisHash = "0".repeat(64);

/** A key audit entries are signed with: its id, stored in each entry it signs, and 32 secret bytes. */
export type AuditChainKey = { id: string; key: Uint8Array };

export type AuditStoreDependencies = {
  clock: Clock;
  ids: IdGenerator;
  /** The chain's keys, newest first: the first signs new entries, and any of them verifies. Read when first needed. */
  chainKeys: () => readonly AuditChainKey[];
};

type Row = {
  seq: string | number;
  id: string;
  at: Date;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string;
  category: AuditCategory;
  action: string;
  target_type: string | null;
  target_id: string | null;
  subject_role: Role | null;
  summary: string;
  details: Record<string, unknown>;
  ip_hash: string | null;
  prev_hash: string;
  row_hash: string;
};

/** JSON with object keys sorted at every depth, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, inner]) => inner !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(",")}}`;
}

type HashedFields = Omit<Row, "seq" | "row_hash" | "prev_hash">;

/** Every field an entry stores, in a fixed order, as its hash covers them. */
function hashedContent(fields: HashedFields): string {
  return canonicalJson([
    fields.id,
    fields.at.toISOString(),
    fields.actor_id,
    fields.actor_role,
    fields.actor_name,
    fields.category,
    fields.action,
    fields.target_type,
    fields.target_id,
    fields.subject_role,
    fields.summary,
    fields.details,
    fields.ip_hash,
  ]);
}

/**
 * An entry's hash as entries were hashed before they were keyed: a SHA-256
 * of its predecessor's hash and every field it stores. Anyone can compute
 * it, so it's kept only to check those older entries.
 */
export function entryHash(prevHash: string, fields: HashedFields): string {
  return createHash("sha256").update(`${prevHash}\n${hashedContent(fields)}`).digest("hex");
}

/** How a keyed entry's row_hash starts, naming the scheme. */
const keyedHashScheme = "hmac1";
const keyedHashPattern = /^hmac1\.([A-Za-z0-9_-]{1,32})\.([0-9a-f]{64})$/;

function keyedMac(key: AuditChainKey, prevHash: string, fields: HashedFields): Buffer {
  return createHmac("sha256", key.key).update(`${keyedHashScheme}.${key.id}\n${prevHash}\n${hashedContent(fields)}`).digest();
}

/** An entry's own hash: "hmac1.<key id>.<HMAC-SHA256 of its predecessor's hash and every field it stores>". */
export function signedEntryHash(key: AuditChainKey, prevHash: string, fields: HashedFields): string {
  return `${keyedHashScheme}.${key.id}.${keyedMac(key, prevHash, fields).toString("hex")}`;
}

function isKeyedHash(rowHash: string): boolean {
  return rowHash.startsWith(`${keyedHashScheme}.`);
}

/** Whether a keyed row_hash is these fields' HMAC under the listed key it names, compared in constant time. */
function keyedHashMatches(keys: readonly AuditChainKey[], prevHash: string, fields: HashedFields, rowHash: string): boolean {
  const [, keyId, mac] = keyedHashPattern.exec(rowHash) ?? [];
  const key = keys.find((candidate) => candidate.id === keyId);
  if (!key || mac === undefined) return false;
  // Both 32 bytes: the pattern allows only 64 hex digits.
  return timingSafeEqual(keyedMac(key, prevHash, fields), Buffer.from(mac, "hex"));
}

function signingKey(keys: readonly AuditChainKey[]): AuditChainKey {
  const key = keys[0];
  if (!key) throw new Error("The audit log has no key to sign entries with.");
  return key;
}

/** What checkSigningKey found. */
export type SigningKeyCheck = { status: "no-signed-entries" } | { status: "matches" } | { status: "other-key"; atSeq: number };

/**
 * Whether the first of `keys` signed the newest keyed entry in the log, so
 * entries it signs will check out wherever that one does. For a script about
 * to write an entry with keys it was given (see src/server/audit.ts), before
 * it changes anything.
 */
export async function checkSigningKey(db: Database, keys: readonly AuditChainKey[]): Promise<SigningKeyCheck> {
  const key = signingKey(keys);
  const row = await db.get<Row>("select * from app.audit_log where row_hash like :keyed order by seq desc limit 1", { keyed: `${keyedHashScheme}.%` });
  if (!row) return { status: "no-signed-entries" };
  const { seq, row_hash: rowHash, prev_hash: prevHash, ...fields } = row;
  return keyedHashMatches([key], prevHash, fields, rowHash) ? { status: "matches" } : { status: "other-key", atSeq: Number(seq) };
}

/** The most entries one list call returns. */
const maxListLimit = 500;

/** A Postgres text array literal of known words (categories and roles, which never need quoting). */
function textArray(values: readonly string[]): string {
  return `{${values.join(",")}}`;
}

function entryOf(row: Row): AuditEntry {
  return {
    seq: Number(row.seq),
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorRole: isRole(row.actor_role) ? row.actor_role : null,
    actorName: row.actor_name,
    category: row.category,
    action: row.action,
    target: row.target_type !== null && row.target_id !== null ? { type: row.target_type, id: row.target_id } : null,
    subjectRole: isRole(row.subject_role) ? row.subject_role : null,
    summary: row.summary,
    details: row.details,
  };
}

export function createPostgresAuditStore(db: Database, deps: AuditStoreDependencies): AuditStore {
  return {
    async record(event: AuditEvent) {
      const key = signingKey(deps.chainKeys());
      const fields: HashedFields = {
        id: deps.ids.newId(),
        at: deps.clock.now(),
        actor_id: event.actor?.id ?? null,
        actor_role: event.actor?.role ?? null,
        actor_name: event.actor?.name ?? "",
        category: event.category,
        action: event.action,
        target_type: event.target?.type ?? null,
        target_id: event.target?.id ?? null,
        subject_role: event.subjectRole ?? null,
        summary: event.summary,
        details: event.details ?? {},
        ip_hash: event.ipHash ?? null,
      };
      await db.transaction(async (tx) => {
        await tx.get("select pg_advisory_xact_lock(:lock)", { lock: advisoryLocks.audit });
        const last = await tx.get<{ row_hash: string }>("select row_hash from app.audit_log order by seq desc limit 1");
        const prevHash = last?.row_hash ?? genesisHash;
        await tx.run(
          `insert into app.audit_log
             (id, at, actor_id, actor_role, actor_name, category, action, target_type, target_id, subject_role, summary, details, ip_hash, prev_hash, row_hash)
           values
             (:id, :at, :actorId, :actorRole, :actorName, :category, :action, :targetType, :targetId, :subjectRole, :summary, :details, :ipHash, :prevHash, :rowHash)`,
          {
            id: fields.id,
            at: fields.at,
            actorId: fields.actor_id,
            actorRole: fields.actor_role,
            actorName: fields.actor_name,
            category: fields.category,
            action: fields.action,
            targetType: fields.target_type,
            targetId: fields.target_id,
            subjectRole: fields.subject_role,
            summary: fields.summary,
            details: jsonParam(fields.details),
            ipHash: fields.ip_hash,
            prevHash,
            rowHash: signedEntryHash(key, prevHash, fields),
          },
        );
      });
    },

    async list({ scope, limit, beforeSeq }) {
      if (scope.categories.length === 0) return [];
      // The same rule as inAuditScope (src/lib/kernel/audit.ts), in the query, so a page is never thinned out afterwards.
      const rows = await db.all<Row>(
        `select * from app.audit_log
         where category = any(:categories::text[])
           and (subject_role is null or subject_role = any(:subjectRoles::text[]))
           and (:beforeSeq::bigint is null or seq < :beforeSeq::bigint)
         order by seq desc limit :limit`,
        {
          categories: textArray(scope.categories),
          subjectRoles: textArray(scope.subjectRoles),
          beforeSeq: beforeSeq ?? null,
          limit: Math.max(1, Math.min(limit, maxListLimit)),
        },
      );
      return rows.map(entryOf);
    },

    async verifyChain() {
      const rows = await db.all<Row>("select * from app.audit_log order by seq asc");
      let prevHash = genesisHash;
      let keys: readonly AuditChainKey[] | null = null;
      let keyedSeen = false;
      for (const row of rows) {
        const { seq, row_hash: rowHash, prev_hash: storedPrev, ...fields } = row;
        const keyed = isKeyedHash(rowHash);
        // An unkeyed entry counts only before the first keyed one.
        const matches = keyed ? keyedHashMatches((keys ??= deps.chainKeys()), prevHash, fields, rowHash) : !keyedSeen && entryHash(prevHash, fields) === rowHash;
        if (storedPrev !== prevHash || !matches) return { status: "broken", atSeq: Number(seq) };
        keyedSeen ||= keyed;
        prevHash = rowHash;
      }
      // Unkeyed entries with no keyed one after them prove nothing: anyone can recompute their hashes.
      const newest = rows.at(-1);
      if (newest && !keyedSeen) return { status: "broken", atSeq: Number(newest.seq) };
      return { status: "intact", entries: rows.length };
    },
  };
}
