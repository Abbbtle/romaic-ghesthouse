import "server-only";
import { createPostgresAuditStore } from "@/adapters/postgres/audit-store";
import { createAuditLogService } from "@/lib/accounts/audit-log-service";
import type { AuditRecorder } from "@/lib/kernel/audit";
import { clock, database, ids, processSingleton } from "./infrastructure";

/**
 * The audit log, wired to the app's database. Cores record through an
 * AuditRecorder; the dashboard's audit page reads through auditLogService(),
 * which decides what each reader may see.
 */
function auditStore() {
  return processSingleton("audit-store", () => createPostgresAuditStore(database(), { clock, ids }));
}

export function auditRecorder(): AuditRecorder {
  return auditStore();
}

export function auditLogService() {
  return createAuditLogService({ log: auditStore() });
}
