import type { IsoDate } from "@/lib/format/zoned-time";
import type { BlockAdd } from "@/lib/inventory/ports";
import type { Stay } from "@/lib/inventory/stays";
import type { AvailabilityBlock } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import type { Booking, BookingStatus, BookingWithGuest, ChannelStay, Guest } from "./reservations";

/**
 * What the reservations core needs from storage. Every write is one atomic
 * command: a booking, its guest and its unit's block go in (or move, or go)
 * together, and the inventory's rule that a unit's night is never taken
 * twice is enforced at write time (in Postgres, the exclusion constraint).
 * Refusals come back as values.
 */

type InventoryRefusal = Exclude<BlockAdd, { status: "added" }>;

export type BookingCreation = {
  /** A new guest to store with the booking, or null to use booking.guestId as it is. */
  newGuest: Guest | null;
  booking: Booking;
  /** The block that holds the booking's nights (reason "booking"). */
  block: AvailabilityBlock;
};

export type CreateOutcome = { status: "created" } | { status: "ref-taken" } | { status: "guest-missing" } | InventoryRefusal;

export type RequestConversion = BookingCreation & {
  requestId: string;
  /** The request must still be waiting on this day. */
  today: IsoDate;
  at: Date;
  by: string;
};

export type ConvertOutcome = CreateOutcome | { status: "request-changed" };

/** A booking made from a channel stay: the stay's own block (if it holds one) goes, the booking's goes in, and the stay records the booking. */
export type ChannelStayConversion = BookingCreation & { channelStayId: string };

export type ChannelStayOutcome = CreateOutcome | { status: "stay-changed" };

export type BookingChange = {
  /** The booking as it should be; its revision is the one to store. */
  booking: Booking;
  /** Applied only over this revision. */
  expectedRevision: number;
};

export type ChangeOutcome = { status: "changed" } | { status: "stale" } | { status: "missing" } | InventoryRefusal;

export type StatusChange = {
  bookingId: string;
  /** Applied only while the booking is in one of these. */
  from: readonly BookingStatus[];
  to: BookingStatus;
  at: Date;
  /** Cancelling and no-shows give the nights back (the block goes). */
  releaseNights: boolean;
  cancelReason?: string | null;
  /** Checking out early: the booking and its block end on this day instead, so the nights left open again. */
  leaveOn?: IsoDate | null;
};

export interface ReservationStore {
  booking(id: string): Promise<BookingWithGuest | null>;
  /** Bookings with at least one night in `range`, any status, arrival order. */
  bookingsOverlapping(range: Stay): Promise<BookingWithGuest[]>;
  /** Bookings arriving or leaving on `day`, or staying over it, that are confirmed or checked in. */
  bookingsAround(day: IsoDate): Promise<BookingWithGuest[]>;
  /** The newest bookings whose guest's name, phone or email, or whose reference, matches `query` (case-insensitive). */
  search(query: string, limit: number): Promise<BookingWithGuest[]>;
  guest(id: string): Promise<Guest | null>;
  searchGuests(query: string, limit: number): Promise<Guest[]>;
  bookingsForGuest(guestId: string): Promise<Booking[]>;
  updateGuest(guest: Guest): Promise<boolean>;
  create(creation: BookingCreation): Promise<CreateOutcome>;
  /** Accepts a waiting booking request into a new booking, all at once (the request records the booking it became). */
  convertRequest(conversion: RequestConversion): Promise<ConvertOutcome>;
  /** A stay imported from a channel's calendar, or null when there's no such stay. */
  channelStay(id: string): Promise<ChannelStay | null>;
  /** Channel stays not yet made into bookings (placeholders and conflicts) with a night from `from` on, arrival order. */
  channelStaysToBook(from: IsoDate, limit: number): Promise<ChannelStay[]>;
  /**
   * Makes a booking from a channel stay that's still a placeholder or a
   * conflict, all at once: the stay's block goes, the booking and its block
   * go in, and the stay becomes "linked" to the booking. "stay-changed" when
   * it was linked or went from the channel meanwhile.
   */
  convertChannelStay(conversion: ChannelStayConversion): Promise<ChannelStayOutcome>;
  /** Changes a booking and moves its block to match (unit and nights), all at once. */
  change(change: BookingChange): Promise<ChangeOutcome>;
  /** Moves a booking from one of `from` to `to`; cancelling also lets go of the channel stay it was made from (the next sync re-imports it if the channel still lists it). */
  setStatus(change: StatusChange): Promise<boolean>;
}

/** Permissions the reservations core checks, from the accounts core (wired in src/server). */
export type ReservationPermission =
  | "bookings:view"
  | "bookings:create"
  | "bookings:change"
  | "bookings:cancel"
  | "guests:view"
  | "guests:manage"
  | "stays:check-in-out"
  | "today:view"
  | "availability:view";

export interface ReservationAccess {
  can(actor: Actor, permission: ReservationPermission): boolean;
  assertCan(actor: Actor, permission: ReservationPermission): void;
}
