import type { IsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";

/**
 * Booking requests: a guest picks dates, a group and an apartment on the
 * Book page and asks for it. The owner or sales accepts it (choosing the
 * unit, whose nights are then closed to everyone else) or declines it, and
 * replies on WhatsApp or by email. Nothing is sent to the guest
 * automatically.
 *
 * A request doesn't hold nights while it waits: two guests may ask for the
 * same apartment, and the Book page keeps showing it free until one is
 * accepted. A request still waiting on its arrival day has expired.
 * Requests are never edited; they leave "waiting" once, for good.
 */

export const requestStatuses = ["waiting", "accepted", "declined", "expired"] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export const requestStatusNames: Record<RequestStatus, string> = {
  waiting: "Waiting",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** When the guest ticked the consent box, and the versions of the wording and privacy notice they saw (POPIA s11, s18). */
export type ConsentRecord = { at: Date; consentVersion: string; noticeVersion: string };

/** What happened to a request: who accepted or declined it, when, and for accepted ones, the unit it went to. */
export type RequestDecision = { at: Date; by: string | null; note: string | null; unitId: string | null };

export type BookingRequest = {
  id: string;
  /** "RG-7K2QX": for conversation only; nothing can be looked up with it. */
  ref: string;
  /** The apartment type asked for, by its slug, and its name as the guest saw it. */
  apartment: string;
  apartmentName: string;
  stay: Stay;
  adults: number;
  children: number;
  name: string;
  /** E.164, "+27821234567". */
  phone: string;
  /** For the owner's reply if the guest prefers email. Nothing is ever emailed to it automatically. */
  email: string | null;
  /** Roughly when they expect to arrive, in their words: "About 18:00". */
  arrivalTime: string | null;
  notes: string | null;
  consent: ConsentRecord;
  status: RequestStatus;
  /**
   * The keyed hash of the guest's IP address (never the address), kept for
   * 24 hours for the rate limits, then forgotten.
   */
  visitorKey: string | null;
  createdAt: Date;
  decision: RequestDecision | null;
};

/** How many guests a request is for. */
export function guestsOf(request: Pick<BookingRequest, "adults" | "children">): number {
  return request.adults + request.children;
}

/** A request as it stands on `today`: one still waiting whose arrival day has passed counts as expired. */
export function statusOn(request: Pick<BookingRequest, "status" | "stay">, today: IsoDate): RequestStatus {
  return request.status === "waiting" && request.stay.arrive < today ? "expired" : request.status;
}
