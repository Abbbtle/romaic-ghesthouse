import "server-only";
import { createHash } from "node:crypto";
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
 */

/** The audit log, both ways: entries go in, and come back out for the audit page. Never changed or removed. */
export type AuditStore = AuditRecorder & AuditLogReader;

/** The hash a chain starts from. */
export const genesisHash = "0".repeat(64);

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

/** An entry's own hash: its predecessor's hash and every field it stores. */
export function entryHash(prevHash: string, fields: HashedFields): string {
  const content = canonicalJson([
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
  return createHash("sha256").update(`${prevHash}\n${content}`).digest("hex");
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

export function createPostgresAuditStore(db: Database, deps: { clock: Clock; ids: IdGenerator }): AuditStore {
  return {
    async record(event: AuditEvent) {
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
            rowHash: entryHash(prevHash, fields),
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
      for (const row of rows) {
        const { seq, row_hash: rowHash, prev_hash: storedPrev, ...fields } = row;
        if (storedPrev !== prevHash || entryHash(prevHash, fields) !== rowHash) return { status: "broken", atSeq: Number(seq) };
        prevHash = rowHash;
      }
      return { status: "intact", entries: rows.length };
    },
  };
}
