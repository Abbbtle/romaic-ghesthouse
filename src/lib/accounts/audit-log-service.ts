import { z } from "zod";
import { auditCategories, type AuditCategory, type AuditEntry, type AuditLogReader, type AuditScope, type ChainCheck } from "@/lib/kernel/audit";
import type { Actor } from "@/lib/kernel/actor";
import { assertCan, can, manageableRoles, type Permission } from "./access";

/**
 * Reading the audit log (roles.md, audit:view). What a reader sees follows
 * from their permissions, never their role's name:
 *
 * - audit:view opens the log at all;
 * - each category needs the permission below, so someone sees changes to
 *   the parts of the business they look after, and audit:view-all (the
 *   owner's) covers the rest: sign-ins, security, money, bookings and guests;
 * - of the entries about an account (team changes), they see only those
 *   about roles they may manage, so an admin sees changes to staff accounts
 *   and nobody else's.
 */

/** The permission, besides audit:view, that reading each category needs. */
export const auditReadPermissions: Record<AuditCategory, Permission> = {
  content: "content:edit",
  media: "media:manage",
  settings: "settings:site",
  integrations: "integrations:configure",
  team: "team:manage-operational",
  auth: "audit:view-all",
  contact: "audit:view-all",
  security: "audit:view-all",
  tasks: "audit:view-all",
  bookings: "audit:view-all",
  guests: "audit:view-all",
  money: "audit:view-all",
  channels: "audit:view-all",
  tax: "audit:view-all",
  periods: "audit:view-all",
  privacy: "audit:view-all",
};

/** Entries per page. */
export const auditPageSize = 50;

/** Which entries `actor` may read; nothing at all without audit:view. */
export function auditScopeFor(actor: Pick<Actor, "role">): AuditScope {
  if (!can(actor, "audit:view")) return { categories: [], subjectRoles: [] };
  return {
    categories: auditCategories.filter((category) => can(actor, auditReadPermissions[category])),
    subjectRoles: manageableRoles(actor),
  };
}

/** One page of the log, and where the next (older) one starts, if there is one. */
export type AuditPage = { entries: AuditEntry[]; olderBeforeSeq: number | null };

const beforeSeqInput = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** The page to start from, from the address's `before` (anything else means the newest page). */
export function parseBeforeSeq(value: unknown): number | undefined {
  const parsed = beforeSeqInput.safeParse(Array.isArray(value) ? value[0] : value);
  return parsed.success ? parsed.data : undefined;
}

export function createAuditLogService(deps: { log: AuditLogReader }) {
  return {
    /** The newest entries `actor` may read, older than `beforeSeq` when given. */
    async page(actor: Actor, beforeSeq?: number): Promise<AuditPage> {
      assertCan(actor, "audit:view");
      // One more than a page says whether there's an older one.
      const found = await deps.log.list({ scope: auditScopeFor(actor), limit: auditPageSize + 1, beforeSeq });
      const entries = found.slice(0, auditPageSize);
      return { entries, olderBeforeSeq: found.length > auditPageSize ? (entries.at(-1)?.seq ?? null) : null };
    },

    /** Whether the whole chain adds up: only for someone who may read every entry. */
    async verifyChain(actor: Actor): Promise<ChainCheck> {
      assertCan(actor, "audit:view-all");
      return deps.log.verifyChain();
    },
  };
}

export type AuditLogService = ReturnType<typeof createAuditLogService>;
