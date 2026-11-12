import { addDays, type IsoDate } from "@/lib/format/zoned-time";
import type { RequestHousekeeping } from "./ports";
import { visitorKeyRetentionMs } from "./spam-rules";

/**
 * How long requests are kept (POPIA s14: no longer than needed). A default
 * until the owner decides (docs/planning/open-questions.md):
 * - a waiting request until its arrival day, when it expires;
 * - declined and expired requests for 90 days after the decision;
 * - accepted requests for 90 days after the stay ends. The unit's block for
 *   those nights stays, without the guest's details. (Phase 3's bookings
 *   take over keeping guest records, with their own retention schedule.)
 * - the visitor key (a keyed hash of the IP address) until the first daily
 *   clean-up after it turns 24 hours old, so for at most about two days.
 * The daily housekeeping applies these in one go.
 */

export const requestRetentionDays = 90;

const dayMs = 24 * 60 * 60 * 1000;

/** Today's housekeeping, given the instant and the business's date. */
export function housekeepingAt(now: Date, today: IsoDate): RequestHousekeeping {
  return {
    expireArrivingBefore: today,
    now,
    deleteDecidedBefore: new Date(now.getTime() - requestRetentionDays * dayMs),
    deleteAcceptedLeavingBefore: addDays(today, -requestRetentionDays),
    forgetVisitorKeysBefore: new Date(now.getTime() - visitorKeyRetentionMs),
  };
}
