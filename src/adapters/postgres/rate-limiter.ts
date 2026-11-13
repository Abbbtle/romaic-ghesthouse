import "server-only";
import { createHash } from "node:crypto";
import { longestRateLimitWindowMs, type RateLimit, type RateLimiter } from "@/lib/kernel/rate-limit";
import type { Clock } from "@/lib/kernel/ports";
import type { Database } from "./database";

/** Keys are kept only as a hash, so the table never holds what callers count by, such as email addresses. */
const storedKey = (key: string): string => createHash("sha256").update(key).digest("base64url");

/**
 * Counts attempts per key in fixed windows, in the database (app.rate_limits),
 * so every server shares one count: serverless hosts run many at once. Each
 * attempt is one atomic upsert, so attempts arriving together are all
 * counted. Fits any core's rate-limiter port, booking's included.
 */
export function createPostgresRateLimiter(db: Database, { scope, maxAttempts, windowMs }: RateLimit, clock: Clock): RateLimiter {
  if (!(windowMs > 0 && windowMs <= longestRateLimitWindowMs)) {
    throw new Error(`The "${scope}" rate limit's window must be longer than nothing and no longer than a week.`);
  }
  return {
    async tryConsume(key) {
      const now = clock.now().getTime();
      // A window that started this long ago or earlier has ended.
      const expiredBy = now - windowMs;
      const row = await db.get<{ attempts: number }>(
        `insert into app.rate_limits (scope, key, window_started_ms, attempts) values (:scope, :key, :now, 1)
         on conflict (scope, key) do update set
           attempts = case when app.rate_limits.window_started_ms <= :expiredBy then 1 else app.rate_limits.attempts + 1 end,
           window_started_ms = case when app.rate_limits.window_started_ms <= :expiredBy then :now else app.rate_limits.window_started_ms end
         returning attempts`,
        { scope, key: storedKey(key), now, expiredBy },
      );
      const attempts = row?.attempts ?? 1;
      // A new window is a good moment to forget windows that have ended, so the table stays small.
      if (attempts === 1) {
        await db.run("delete from app.rate_limits where scope = :scope and window_started_ms <= :expiredBy", { scope, expiredBy });
      }
      return attempts <= maxAttempts;
    },

    async reset(key) {
      await db.run("delete from app.rate_limits where scope = :scope and key = :key", { scope, key: storedKey(key) });
    },
  };
}

/**
 * Forgets windows that have certainly ended, in every scope: those that
 * started a week (longestRateLimitWindowMs) or more before `now`. Limiters
 * already forget their own scope's ended windows as new ones start; this is
 * for the daily clean-up, which also catches scopes nobody uses any more.
 * Returns how many went.
 */
export async function deleteEndedRateLimitWindows(db: Database, now: Date): Promise<number> {
  const { changes } = await db.run("delete from app.rate_limits where window_started_ms <= :endedBy", {
    endedBy: now.getTime() - longestRateLimitWindowMs,
  });
  return changes;
}
