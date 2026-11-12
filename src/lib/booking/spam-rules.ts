import type { RateLimit } from "@/lib/kernel/rate-limit";

/**
 * The booking form's abuse controls, as rules the service applies before it
 * stores anything:
 * - a honeypot field and a minimum fill time: a bot that trips either gets
 *   the normal "request sent" screen, so it has no reason to try again, and
 *   nothing is stored or sent;
 * - the form's signed "shown at" time must be genuine and under a day old;
 * - five requests an hour and twenty a day per visitor key (a keyed hash of
 *   the IP address, or of its /64 network for IPv6; kept for about a day,
 *   until the daily clean-up after it turns 24 hours old);
 * - sixty requests an hour across the whole site, so a flood from many
 *   addresses can't fill the inbox or the owner's mailbox;
 * - at most three waiting requests per phone number, and no second request
 *   from a phone for an apartment and nights it already asked for
 *   (BookingStore.create). Both refusals read the same, so the form never
 *   tells a stranger whether a phone number has a request waiting.
 */

const secondMs = 1000;
const hourMs = 60 * 60 * secondMs;
const dayMs = 24 * hourMs;

/** People take longer than this to fill in the form; bots usually don't. */
export const minimumFillMs = 3 * secondMs;

/** A form shown longer ago than this must be reloaded before it can be sent. */
export const formTokenMaxAgeMs = dayMs;

/** How long a request keeps its visitor key (POPIA: hashed IP addresses are kept for 24 hours). */
export const visitorKeyRetentionMs = dayMs;

/** Waiting requests one phone number may have at a time. */
export const maxWaitingPerPhone = 3;

/** The request form's limits per visitor key. Each needs its own scope. */
export const requestRateLimits = {
  perHour: { scope: "booking-request:hour", maxAttempts: 5, windowMs: hourMs },
  perDay: { scope: "booking-request:day", maxAttempts: 20, windowMs: dayMs },
  /** Counted under one key for everyone (siteWideKey). */
  siteWide: { scope: "booking-request:site", maxAttempts: 60, windowMs: hourMs },
} as const satisfies Record<string, RateLimit>;

/** The one key the site-wide limit counts under. */
export const siteWideKey = "all-visitors";

/**
 * How the form's timing reads:
 * - "fine": sent between 3 seconds and a day after it was shown;
 * - "too-fast": sent within 3 seconds (or "before" it was shown): a bot;
 * - "stale": no genuine token, or over a day old: the visitor must reload.
 */
export type FormTiming = "fine" | "too-fast" | "stale";

/** `shownAt` is what the form token says (null when there's no genuine one). */
export function formTimingOf(shownAt: Date | null, now: Date): FormTiming {
  if (!shownAt) return "stale";
  const elapsed = now.getTime() - shownAt.getTime();
  if (elapsed < minimumFillMs) return "too-fast";
  return elapsed > formTokenMaxAgeMs ? "stale" : "fine";
}

/** Shown when the form must be reloaded: its token is missing, changed or too old. */
export const staleFormMessage = "This form has been open too long to send. Reload the page and try again.";

/**
 * For a phone with too many requests waiting, or one that already asked for
 * these nights: the same words for both, which say nothing about anyone's
 * requests, so the form can't be used to find out whether a number has one.
 */
export const phoneLimitMessage = "We can't take another request from this number online. Please WhatsApp or call us and we'll help.";

export const rateLimitedMessage = "Too many requests from this connection. Please WhatsApp or call us instead.";
