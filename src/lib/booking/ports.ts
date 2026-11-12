import type { IsoDate } from "@/lib/format/zoned-time";
import type { BlockAdd } from "@/lib/inventory/ports";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { RateLimiter } from "@/lib/kernel/rate-limit";
import type { BookingRequest } from "./requests";

/**
 * What booking requests need from the outside world, besides the inventory
 * service and the kernel's ports. Adapters implement these (Postgres, HMAC,
 * node:crypto); the in-memory ones in ./testing behave the same way.
 *
 * Every write to BookingStore is one atomic command, so an adapter can make
 * it one transaction, and the store guards its own rules at write time.
 * Refusals come back as values, never as thrown errors.
 *
 * "Waiting" below means status waiting with an arrival day on or after
 * `today`: a waiting request whose arrival day has passed counts as expired,
 * even before the daily housekeeping records it.
 */

export type RequestCreation =
  | { status: "created" }
  /** The phone already has a waiting request for this apartment sharing a night with this one. */
  | { status: "duplicate" }
  /** The phone already has `maxWaitingPerPhone` waiting requests. */
  | { status: "too-many-waiting" }
  /** Another request already has this reference code: try again with a new one. */
  | { status: "ref-taken" };

export type RequestAcceptance = {
  requestId: string;
  /** The block that closes the chosen unit for the request's nights (reason "request", requestId set). */
  block: AvailabilityBlock;
  at: Date;
  by: string;
  today: IsoDate;
};

export type AcceptOutcome =
  | { status: "accepted" }
  /** The request isn't waiting any more (handled, expired or gone): nothing changed. */
  | { status: "request-changed" }
  /** The inventory refused the block (the unit is taken on one of the nights, or isn't offered): the request stays waiting. */
  | Exclude<BlockAdd, { status: "added" }>;

export type RequestDecline = { requestId: string; at: Date; by: string; note: string | null; today: IsoDate };

/** Cancelling an accepted request whose stay hasn't ended (leaving after `today`): its nights open again. */
export type RequestRelease = { requestId: string; at: Date; by: string; note: string; today: IsoDate };

/** The daily tidy-up, done in one transaction (see BookingStore.housekeeping). */
export type RequestHousekeeping = {
  /** Waiting requests arriving before this day become expired, decided now. */
  expireArrivingBefore: IsoDate;
  now: Date;
  /** Declined and expired requests decided before this are deleted. */
  deleteDecidedBefore: Date;
  /** Accepted requests whose stay ended before this day are deleted (their block stays, without the guest's details). */
  deleteAcceptedLeavingBefore: IsoDate;
  /** Requests sent before this forget their visitor key. */
  forgetVisitorKeysBefore: Date;
};

export type HousekeepingReport = { expired: number; deleted: number; visitorKeysForgotten: number };

export interface BookingStore {
  request(id: string): Promise<BookingRequest | null>;
  /** The first `limit` requests waiting on `today`, soonest arrival first (then oldest first). */
  waiting(today: IsoDate, limit: number): Promise<BookingRequest[]>;
  /** The most recent `limit` requests not waiting on `today`, most recently decided (or, for unrecorded expiries, sent) first. */
  handled(today: IsoDate, limit: number): Promise<BookingRequest[]>;
  /** How many requests are waiting on `today`. */
  waitingCount(today: IsoDate): Promise<number>;
  /**
   * Stores a new request, unless the same phone already has a waiting request
   * for the same apartment sharing a night ("duplicate") or
   * `maxWaitingPerPhone` waiting requests ("too-many-waiting"). Reference
   * codes are unique ("ref-taken"). Requests from one phone are checked and
   * stored one at a time, so two sent together can't both slip past.
   */
  create(request: BookingRequest, rules: { maxWaitingPerPhone: number; today: IsoDate }): Promise<RequestCreation>;
  /**
   * Accepts a waiting request and closes the unit's nights with `block`, all
   * or nothing: if the request isn't waiting on `today`, or the inventory
   * refuses the block, nothing changes.
   */
  accept(acceptance: RequestAcceptance): Promise<AcceptOutcome>;
  /** Declines a request while it's still waiting. False when it wasn't (or is gone). */
  decline(decline: RequestDecline): Promise<boolean>;
  /**
   * Cancels an accepted request whose guest hasn't left yet, all at once: its
   * block goes (the nights open again) and it's recorded as declined with
   * `note`. False when it isn't accepted, has ended, or is gone.
   */
  release(release: RequestRelease): Promise<boolean>;
  /** Expires, deletes and forgets per `rules`, in that order, in one transaction. */
  housekeeping(rules: RequestHousekeeping): Promise<HousekeepingReport>;
}

/**
 * Signed "form shown at" times for the booking form, so the server can tell
 * how long a guest took and that the form came from this site. The adapter
 * signs with a server secret (HMAC). Tokens carry no personal data.
 */
export interface FormTokens {
  sign(issuedAt: Date): string;
  /** When the form was shown, if this signer made `token` and nobody changed it; null for anything else. */
  verify(token: string): Date | null;
}

/** Requests are limited per visitor key in two windows, an hour and a day, and across the whole site per hour. */
export type RequestRateLimits = { perHour: RateLimiter; perDay: RateLimiter; siteWide: RateLimiter };

/** Random whole numbers, for reference codes. Cryptographically secure in production (node:crypto's randomInt). */
export interface RandomSource {
  /** A whole number from 0 up to, but not including, `max`, each equally likely. */
  randomInt(max: number): number;
}

/** Permission checks, from the accounts core (wired in src/server). */
export type BookingPermission = "bookings:view" | "bookings:create" | "bookings:cancel";

export interface BookingAccess {
  can(actor: Actor, permission: BookingPermission): boolean;
  assertCan(actor: Actor, permission: BookingPermission): void;
}
