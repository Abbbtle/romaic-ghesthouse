/**
 * Rate limits as every core sees them: a limit's policy, the port that
 * counts attempts against it (the Postgres adapter in
 * src/adapters/postgres/rate-limiter.ts), and the message a refusal shows,
 * worked out from the limit itself so it can't drift from the window.
 */

export type RateLimit = {
  /**
   * Names this limit, and must be unique per limiter: two limiters with one
   * scope would share counts, and the shorter window's clean-up would delete
   * the longer one's.
   */
  scope: string;
  /** Attempts allowed per window. */
  maxAttempts: number;
  /** A fixed window's length in milliseconds, from a key's first attempt in it. At most longestRateLimitWindowMs. */
  windowMs: number;
};

/**
 * The longest window a limit may count in: a week. The daily clean-up
 * forgets every window older than this, whatever its scope, so a longer one
 * would be cut short.
 */
export const longestRateLimitWindowMs = 7 * 24 * 60 * 60 * 1000;

/**
 * Counts attempts per key, such as sign-ins per email address, and says when
 * to stop. The Postgres adapter keeps only a hash of each key.
 */
export interface RateLimiter {
  /** Records an attempt. False when the key has used up its allowance. */
  tryConsume(key: string): Promise<boolean>;
  /** Forgets a key's attempts, such as an address's after it signs in. */
  reset(key: string): Promise<void>;
}

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

/** A window's length as someone would say it: "15 minutes", "an hour", "2 days". Rounded up, so it's never shorter than the wait. */
export function windowLength(windowMs: number): string {
  const [unitMs, one, many] = windowMs >= dayMs ? [dayMs, "a day", "days"] : windowMs >= hourMs ? [hourMs, "an hour", "hours"] : [minuteMs, "a minute", "minutes"];
  const count = Math.max(1, Math.ceil(windowMs / unitMs));
  return count === 1 ? one : `${count} ${many}`;
}

/** What a refusal says: "Too many attempts. Wait 15 minutes, then try again." `what` names what was counted. */
export function tooManyMessage(limit: RateLimit, what = "attempts"): string {
  return `Too many ${what}. Wait ${windowLength(limit.windowMs)}, then try again.`;
}
