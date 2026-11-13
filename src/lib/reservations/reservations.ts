import type { IsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";

/**
 * Bookings and the guests who make them. A booking is one stay in one unit:
 * a family needing two apartments has two bookings. While a booking holds
 * its nights (confirmed, checked in or checked out) its unit is blocked for
 * them (an inventory block with reason "booking"), so nothing else can take
 * them; cancelling or a no-show gives them back.
 *
 * Money is in cents (ZAR): the agreed total for the stay and the deposit due.
 * What's been paid lives with payments (src/lib/money), never here.
 */

export const bookingStatuses = ["confirmed", "checked-in", "checked-out", "cancelled", "no-show"] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

export const bookingStatusNames: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  "checked-in": "Checked in",
  "checked-out": "Checked out",
  cancelled: "Cancelled",
  "no-show": "No-show",
};

/** Whether a booking in this state keeps its unit's nights. */
export function holdsNights(status: BookingStatus): boolean {
  return status === "confirmed" || status === "checked-in" || status === "checked-out";
}

/**
 * Where a booking came from that isn't a channel: the website's Book page
 * (direct), a phone call, or someone at the gate. Channels (Booking.com and
 * the rest) add their own keys (src/lib/channels).
 */
export const directSources = ["direct", "phone", "walk-in"] as const;

export const directSourceNames: Record<(typeof directSources)[number], string> = {
  direct: "Direct (website)",
  phone: "Phone or WhatsApp",
  "walk-in": "Walk-in",
};

export type Guest = {
  id: string;
  name: string;
  /** E.164, "+27821234567". */
  phone: string | null;
  email: string | null;
  /** For sales and the owner only. */
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Booking = {
  id: string;
  /** "RG-7K2QX": for conversation; a booking from a request keeps the request's. */
  ref: string;
  guestId: string;
  /** direct, phone, walk-in, or a channel's key. */
  channel: string;
  status: BookingStatus;
  /** The apartment type's slug, and the unit the guest stays in. */
  apartment: string;
  unitId: string;
  stay: Stay;
  adults: number;
  children: number;
  totalCents: number;
  depositDueCents: number;
  /** What staff may see: "late arrival", "extra towels". */
  serviceNotes: string | null;
  /** For sales and the owner only. */
  notes: string | null;
  /** The channel's own booking number. */
  externalRef: string | null;
  requestId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Goes up with every change; a change is accepted only over the revision the editor started from. */
  revision: number;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
};

export type BookingWithGuest = Booking & { guest: Guest };

/** What a booking's status should read as on `today`: a confirmed stay whose arrival has passed is overdue, not a no-show until someone says so. */
export function isArrivingOn(booking: Pick<Booking, "status" | "stay">, today: IsoDate): boolean {
  return booking.status === "confirmed" && booking.stay.arrive === today;
}

export function isLeavingOn(booking: Pick<Booking, "status" | "stay">, today: IsoDate): boolean {
  return booking.status === "checked-in" && booking.stay.leave === today;
}

/** In the house tonight: checked in, and leaving after today. */
export function isInHouse(booking: Pick<Booking, "status" | "stay">, today: IsoDate): boolean {
  return booking.status === "checked-in" && booking.stay.leave > today;
}

/**
 * A stay imported from a channel's calendar (src/lib/channels), as a booking
 * made from it needs it: the unit whose calendar it came from, the channel,
 * its nights and where it stands. A placeholder holds its nights with a
 * "channel" block; a conflict holds nothing (its unit was already taken).
 */
export type ChannelStay = {
  id: string;
  unitId: string;
  channel: string;
  stay: Stay;
  status: "placeholder" | "conflict" | "linked" | "gone";
  bookingId: string | null;
};

/** Whether a channel stay can still become a booking: not yet one, and still on the channel. */
export function canBookChannelStay(stay: Pick<ChannelStay, "status" | "bookingId">): boolean {
  return (stay.status === "placeholder" || stay.status === "conflict") && stay.bookingId === null;
}
