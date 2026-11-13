import "server-only";
import { randomUUID } from "node:crypto";
import type { MfaStore, StoredAuthenticator } from "@/lib/accounts/ports";
import type { Database } from "./database";
import { isUuid } from "./uuid";

/**
 * Authenticators and recovery codes over Postgres (app.mfa_totp,
 * app.mfa_recovery_codes; see ./migrations/020-mfa.ts). Accepting a code is
 * one conditional update, so the same code can't be accepted twice even when
 * two requests carry it at once.
 */
export function createPostgresMfaStore(db: Database): MfaStore {
  return {
    async find(accountId) {
      if (!isUuid(accountId)) return null;
      const row = await db.get<{ secret_ciphertext: string; confirmed_at: Date | null; last_used_step: string | number | null }>(
        "select secret_ciphertext, confirmed_at, last_used_step from app.mfa_totp where account_id = :accountId",
        { accountId },
      );
      if (!row) return null;
      const stored: StoredAuthenticator = {
        secretCiphertext: row.secret_ciphertext,
        confirmedAt: row.confirmed_at,
        lastUsedStep: row.last_used_step === null ? null : Number(row.last_used_step),
      };
      return stored;
    },

    async beginEnrolment(accountId, { secretCiphertext, at }) {
      if (!isUuid(accountId)) return false;
      const { changes } = await db.run(
        `insert into app.mfa_totp (account_id, secret_ciphertext, confirmed_at, last_used_step, created_at)
         values (:accountId, :secretCiphertext, null, null, :at)
         on conflict (account_id) do update set secret_ciphertext = excluded.secret_ciphertext, created_at = excluded.created_at
         where app.mfa_totp.confirmed_at is null`,
        { accountId, secretCiphertext, at },
      );
      return changes > 0;
    },

    async confirmEnrolment(accountId, { at, step, recoveryCodeHashes }) {
      if (!isUuid(accountId)) return false;
      return db.transaction(async (tx) => {
        const { changes } = await tx.run(
          "update app.mfa_totp set confirmed_at = :at, last_used_step = :step where account_id = :accountId and confirmed_at is null",
          { accountId, at, step },
        );
        if (changes === 0) return false;
        await tx.run("delete from app.mfa_recovery_codes where account_id = :accountId", { accountId });
        for (const codeHash of recoveryCodeHashes) {
          await tx.run("insert into app.mfa_recovery_codes (id, account_id, code_hash, used_at, created_at) values (:id, :accountId, :codeHash, null, :at)", {
            id: randomUUID(),
            accountId,
            codeHash,
            at,
          });
        }
        return true;
      });
    },

    async listSecretCiphertexts() {
      const rows = await db.all<{ account_id: string; secret_ciphertext: string }>("select account_id, secret_ciphertext from app.mfa_totp order by account_id");
      return rows.map((row) => ({ accountId: row.account_id, secretCiphertext: row.secret_ciphertext }));
    },

    async replaceSecretCiphertext(accountId, { previous, next }) {
      if (!isUuid(accountId)) return false;
      const { changes } = await db.run(
        "update app.mfa_totp set secret_ciphertext = :next where account_id = :accountId and secret_ciphertext = :previous",
        { accountId, previous, next },
      );
      return changes > 0;
    },

    async recordUse(accountId, step) {
      if (!isUuid(accountId)) return false;
      const { changes } = await db.run(
        `update app.mfa_totp set last_used_step = :step
         where account_id = :accountId and confirmed_at is not null and (last_used_step is null or last_used_step < :step)`,
        { accountId, step },
      );
      return changes > 0;
    },

    async remove(accountId) {
      if (!isUuid(accountId)) return;
      await db.transaction(async (tx) => {
        await tx.run("delete from app.mfa_recovery_codes where account_id = :accountId", { accountId });
        await tx.run("delete from app.mfa_totp where account_id = :accountId", { accountId });
      });
    },

    async replaceRecoveryCodes(accountId, codeHashes, at) {
      if (!isUuid(accountId)) return;
      await db.transaction(async (tx) => {
        await tx.run("delete from app.mfa_recovery_codes where account_id = :accountId", { accountId });
        for (const codeHash of codeHashes) {
          await tx.run("insert into app.mfa_recovery_codes (id, account_id, code_hash, used_at, created_at) values (:id, :accountId, :codeHash, null, :at)", {
            id: randomUUID(),
            accountId,
            codeHash,
            at,
          });
        }
      });
    },

    async useRecoveryCode(accountId, codeHash, at) {
      if (!isUuid(accountId)) return false;
      const { changes } = await db.run(
        "update app.mfa_recovery_codes set used_at = :at where account_id = :accountId and code_hash = :codeHash and used_at is null",
        { accountId, codeHash, at },
      );
      return changes > 0;
    },

    async countUnusedRecoveryCodes(accountId) {
      if (!isUuid(accountId)) return 0;
      const row = await db.get<{ count: string | number }>("select count(*) as count from app.mfa_recovery_codes where account_id = :accountId and used_at is null", { accountId });
      return Number(row?.count ?? 0);
    },
  };
}
