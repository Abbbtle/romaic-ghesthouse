import type { Actor } from "@/lib/kernel/actor";
import type { ReportRange } from "./report-range";
import type { CheckedOutStay, CommissionEntry, HeldBlock, HeldStay, OwingBooking, ReportUnit } from "./reports";

/** Two instants: from `start` (included) to `end` (not). */
export type Instants = { start: Date; end: Date };

/**
 * What the reports read. Every method is a plain read of records as they
 * are; the sums are worked out in ./reports.ts, so the same rules hold
 * whatever store answers. Adapters implement this (Postgres); src/server
 * wires it in.
 */
export interface ReportStore {
  /** Every unit, switched on or off, in their usual order. */
  units(): Promise<ReportUnit[]>;
  /**
   * Bookings that hold their nights (confirmed, checked in, checked out)
   * with a night in the range, or arriving or leaving in it: arrive on or
   * before `until` and leave on or after `from`.
   */
  staysAround(range: ReportRange): Promise<HeldStay[]>;
  /** Blocks made by the owner, for maintenance, by a channel stay or by a booking request, with a night in the range. */
  blocksWithin(range: ReportRange): Promise<HeldBlock[]>;
  /** When each housekeeping task marked done between the instants was finished. */
  cleansDone(between: Instants): Promise<Date[]>;
  /** Bookings checked out between the instants, with when. */
  checkedOut(between: Instants): Promise<(Omit<CheckedOutStay, "checkedOutOn"> & { checkedOutAt: Date })[]>;
  /** Journals dated in the range with a line on Channel commission (5000), each with its net on it and the other accounts it touches. */
  commission(range: ReportRange): Promise<CommissionEntry[]>;
  /**
   * Bookings that hold their nights whose received payments (less refunds)
   * don't cover their total, each with every payment recorded against it,
   * so the money core's own sum decides what's owed.
   */
  owing(): Promise<OwingBooking[]>;
  /** Channels' names by key, from their records: "booking-com" → "Booking.com". */
  channelNames(): Promise<Record<string, string>>;
  /** The month the financial year ends (1–12), from the books' settings. */
  yearEndMonth(): Promise<number>;
}

export type ReportPermission = "reports:operations" | "reports:revenue";

export interface ReportAccess {
  can(actor: Actor, permission: ReportPermission): boolean;
  assertCan(actor: Actor, permission: ReportPermission): void;
}
