import "server-only";
import type { AccountTokenStore } from "@/lib/accounts/ports";
import type { Database } from "./database";
import { isUuid } from "./uuid";

/**
 * Single-use email links over Postgres (app.account_tokens; see
 * ./migrations/030-account-tokens.ts). Using a link is one conditional
 * update, so a link can't be used twice even when two requests race.
 */
export function createPostgresAccountTokenStore(db: Database): AccountTokenStore {
  return {
    async issue(token) {
      if (!isUuid(token.accountId)) return;
      await db.transaction(async (tx) => {
        // Only the newest link for a purpose works: asking again retires the earlier ones.
        await tx.run("update app.account_tokens set used_at = :at where account_id = :accountId and purpose = :purpose and used_at is null", {
          accountId: token.accountId,
          purpose: token.purpose,
          at: token.createdAt,
        });
        await tx.run(
          `insert into app.account_tokens (token_hash, account_id, purpose, email, created_at, expires_at, used_at)
           values (:tokenHash, :accountId, :purpose, :email, :createdAt, :expiresAt, null)`,
          { ...token, email: token.email.toLowerCase() },
        );
      });
    },

    async consume(tokenHash, purpose, now) {
      const row = await db.get<{ account_id: string; email: string }>(
        `update app.account_tokens set used_at = :now
         where token_hash = :tokenHash and purpose = :purpose and used_at is null and expires_at > :now
         returning account_id, email`,
        { tokenHash, purpose, now },
      );
      return row ? { accountId: row.account_id, email: row.email } : null;
    },

    async deleteExpired(now) {
      return (await db.run("delete from app.account_tokens where expires_at <= :now", { now })).changes;
    },
  };
}
