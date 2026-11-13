import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newDataKeyEntry } from "@/adapters/crypto/field-encryption";
import { createPostgresAccountStores } from "@/adapters/postgres/account-stores";
import { createPostgresAuditStore } from "@/adapters/postgres/audit-store";
import type { Database } from "@/adapters/postgres/database";
import { createPostgresMfaStore } from "@/adapters/postgres/mfa-store";
import { pgliteTestDatabases } from "@/adapters/postgres/testing/pglite";
import { recoveryService } from "./accounts";
import { auditChainKeys } from "./audit";
import { createServerEnv, developmentDataKey } from "./env";
import { clock, ids } from "./infrastructure";

/**
 * The break-glass reset (scripts/reset-password.ts) runs from an operator's
 * machine, not the site, and signs its audit entry with whatever
 * DATA_ENCRYPTION_KEY that machine has. An entry signed with any key but the
 * site's would mark the append-only log changed for good, so the reset must
 * refuse such a key before it touches the account.
 */

const databases = pgliteTestDatabases();
const siteKeys = newDataKeyEntry("k1");
const realDatabase = { DATABASE_URL_UNPOOLED: "postgres://db.example.com:5432/postgres" };
const ownerId = "00000000-0000-4000-8000-000000000001";
const at = new Date("2026-11-12T08:00:00.000Z");

/** The site's database: an owner with an authenticator, and an audit log the site signed with its own key. */
async function siteDatabase() {
  const db = databases.migrated();
  await createPostgresAccountStores(db).accounts.create({
    id: ownerId,
    email: "nico@example.com",
    name: "Nico",
    role: "owner",
    status: "active",
    passwordHash: "plain:the owner's own passphrase",
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    emailVerifiedAt: at,
    createdAt: at,
    updatedAt: at,
    lastSignedInAt: null,
  });
  const mfa = createPostgresMfaStore(db);
  await mfa.beginEnrolment(ownerId, { secretCiphertext: "v1.k1.sealed-secret", at });
  await mfa.confirmEnrolment(ownerId, { at, step: 1, recoveryCodeHashes: ["a-recovery-code-hash"] });
  const siteLog = createPostgresAuditStore(db, { clock, ids, chainKeys: () => auditChainKeys(createServerEnv({ NODE_ENV: "production", DATA_ENCRYPTION_KEY: siteKeys })) });
  await siteLog.record({ actor: null, category: "auth", action: "sign-in.failed", summary: "Something the site recorded" });
  return { db, siteLog };
}

/** Everything a reset would change: the owner's password, authenticator and the audit log. */
async function whatAResetChanges(db: Database) {
  return {
    account: await createPostgresAccountStores(db).accounts.findById(ownerId),
    authenticator: await createPostgresMfaStore(db).find(ownerId),
    entries: await db.all("select seq, row_hash from app.audit_log order by seq"),
  };
}

describe("the break-glass reset's audit key", () => {
  it("refuses the public development key against a real database, before changing anything", async () => {
    const { db, siteLog } = await siteDatabase();
    const before = await whatAResetChanges(db);
    // DATA_ENCRYPTION_KEY unset on the operator's machine: the development key would stand in.
    await assert.rejects(recoveryService(db, createServerEnv(realDatabase)), /DATA_ENCRYPTION_KEY isn't set, or is the public development key/);
    await assert.rejects(recoveryService(db, createServerEnv({ ...realDatabase, DATA_ENCRYPTION_KEY: developmentDataKey })), /public development key/);
    assert.deepEqual(await whatAResetChanges(db), before);
    assert.deepEqual(await siteLog.verifyChain(), { status: "intact", entries: 1 });
  });

  it("refuses a key that didn't sign the audit log's newest entry, before changing anything", async () => {
    const { db, siteLog } = await siteDatabase();
    const before = await whatAResetChanges(db);
    for (const keys of [newDataKeyEntry("k1"), `${newDataKeyEntry("k2")},${siteKeys}`]) {
      await assert.rejects(recoveryService(db, createServerEnv({ ...realDatabase, DATA_ENCRYPTION_KEY: keys })), /wasn't signed with the first key in DATA_ENCRYPTION_KEY/, keys.slice(0, 2));
    }
    // The local database is checked the same way: here the development key didn't sign it either.
    await assert.rejects(recoveryService(db, createServerEnv({})), /wasn't signed with the first key/);
    assert.deepEqual(await whatAResetChanges(db), before);
    assert.deepEqual(await siteLog.verifyChain(), { status: "intact", entries: 1 });
  });

  it("resets access with the site's key, writing an entry the site's log check accepts", async () => {
    const { db, siteLog } = await siteDatabase();
    const recovery = await recoveryService(db, createServerEnv({ ...realDatabase, DATA_ENCRYPTION_KEY: siteKeys }));
    const result = await recovery.resetAccess("Nico@Example.com", { operator: "Weberu: A. Person", reason: "The owner's written request" });
    assert.equal(result.status, "reset");
    assert.equal(await createPostgresMfaStore(db).find(ownerId), null);
    assert.deepEqual(await siteLog.verifyChain(), { status: "intact", entries: 2 });
  });
});
