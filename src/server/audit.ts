import "server-only";
import { parseDataKeys, type DataKey } from "@/adapters/crypto/field-encryption";
import { derivePurposeKey } from "@/adapters/crypto/hmac";
import { checkSigningKey, createPostgresAuditStore, type AuditChainKey, type AuditStore } from "@/adapters/postgres/audit-store";
import type { Database } from "@/adapters/postgres/database";
import { createAuditLogService } from "@/lib/accounts/audit-log-service";
import type { AuditRecorder } from "@/lib/kernel/audit";
import { developmentDataKey, env, type ServerEnv } from "./env";
import { clock, database, ids, processSingleton } from "./infrastructure";

/**
 * The audit log, wired to the app's database. Cores record through an
 * AuditRecorder; the dashboard's audit page reads through auditLogService(),
 * which decides what each reader may see.
 *
 * Entries are signed with keys derived from DATA_ENCRYPTION_KEY's, one for
 * each data key and under its id, so the database never holds them and they
 * rotate with the data keys. Production records nothing without
 * DATA_ENCRYPTION_KEY; development uses the public development key.
 */

/** The audit log's keys for `serverEnv`: one derived from each DATA_ENCRYPTION_KEY entry, newest first. */
export function auditChainKeys(serverEnv: ServerEnv = env): AuditChainKey[] {
  return parseDataKeys(serverEnv.dataEncryptionKeys()).map(chainKeyOf);
}

function chainKeyOf(dataKey: DataKey): AuditChainKey {
  return { id: dataKey.id, key: derivePurposeKey(dataKey.key, "audit-chain") };
}

function auditStore() {
  return processSingleton("audit-store", () =>
    createPostgresAuditStore(database(), { clock, ids, chainKeys: () => processSingleton("audit-chain-keys", () => auditChainKeys()) }),
  );
}

export function auditRecorder(): AuditRecorder {
  return auditStore();
}

export function auditLogService() {
  return createAuditLogService({ log: auditStore() });
}

/**
 * The audit log over a database a script opened (scripts/reset-password.ts),
 * once it's sure the entries it writes will check out where the site reads
 * the log. The table is append-only, so an entry signed with any other key
 * would mark the record changed from that entry on, for good. It refuses:
 *
 * - the public development key when the script points at a real database
 *   (serverEnv.scriptDatabaseUrl()), which is what an operator's machine
 *   without DATA_ENCRYPTION_KEY would otherwise sign with;
 * - a first key that didn't sign the log's newest keyed entry, so isn't the
 *   site's.
 *
 * Await it before changing anything, so a key problem stops the script first.
 */
export async function scriptAuditStore(db: Database, serverEnv: ServerEnv = env): Promise<AuditStore> {
  const dataKeys = parseDataKeys(serverEnv.dataEncryptionKeys());
  const publicKeys = parseDataKeys(developmentDataKey).map((dataKey) => dataKey.key);
  if (serverEnv.scriptDatabaseUrl() !== null && dataKeys.some((dataKey) => publicKeys.some((publicKey) => publicKey.equals(dataKey.key)))) {
    throw new Error("DATA_ENCRYPTION_KEY isn't set, or is the public development key: set it to the site's own (every key, newest first) and run this again.");
  }
  const keys = dataKeys.map(chainKeyOf);
  const check = await checkSigningKey(db, keys);
  if (check.status === "other-key") {
    throw new Error(
      `The newest signed audit entry (${check.atSeq}) wasn't signed with the first key in DATA_ENCRYPTION_KEY ("${keys[0]?.id}"): set it to exactly the site's (every key, newest first) and run this again.`,
    );
  }
  return createPostgresAuditStore(db, { clock, ids, chainKeys: () => keys });
}
