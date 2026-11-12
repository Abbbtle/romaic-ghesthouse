import type { RateLimit } from "@/lib/kernel/rate-limit";

/**
 * How often each part of signing in may be tried. The services word their
 * refusals from these (tooManyMessage), and src/server/accounts.ts counts
 * against the same ones, so a message always matches its limit.
 */

/** Eight tries per email address, and per visitor, every fifteen minutes (also guesses at a current password). */
export const signInLimit: RateLimit = { scope: "sign-in", maxAttempts: 8, windowMs: 15 * 60 * 1000 };

/** Five setup attempts per visitor every fifteen minutes: enough for typos, too few to guess a setup code. */
export const setupLimit: RateLimit = { scope: "setup", maxAttempts: 5, windowMs: 15 * 60 * 1000 };

/** Five authenticator or recovery codes per account every fifteen minutes. */
export const mfaLimit: RateLimit = { scope: "mfa", maxAttempts: 5, windowMs: 15 * 60 * 1000 };

/** Five reset or confirmation emails per address, per visitor or per account every hour, so the forms can't flood an inbox. */
export const emailLinkLimit: RateLimit = { scope: "email-links", maxAttempts: 5, windowMs: 60 * 60 * 1000 };
