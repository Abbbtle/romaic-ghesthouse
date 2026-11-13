import { z } from "zod";
import type { Stay } from "@/lib/inventory/stays";

/**
 * Channels: the online travel agents that sell Romaic's apartments
 * (Booking.com and others), kept in step with two-way iCal per unit:
 *
 * - each unit publishes one export feed (the nights it isn't available),
 *   which each channel subscribes to;
 * - each unit imports each channel's calendar for it; an imported stay
 *   becomes a "channel" block (a placeholder) that holds the nights until
 *   sales completes it as a booking from the channel's extranet.
 *
 * iCal carries dates only: no guest, price or contact. And it isn't live:
 * channels re-read the feed on their own schedule, and Romaic imports with
 * "Sync now" and the daily job. Between those, a double booking can happen;
 * the dashboard says when it has.
 */

export type Channel = { key: string; name: string; active: boolean; sort: number };

export const calendarStatuses = ["never", "ok", "error"] as const;

export type CalendarStatus = (typeof calendarStatuses)[number];

/** A channel's calendar for one unit. Its URL is a secret (anyone holding it can read the calendar), kept encrypted and never shown back. */
export type ChannelCalendar = {
  id: string;
  unitId: string;
  channel: string;
  /** The URL's host, for display: "admin.booking.com". */
  host: string;
  lastSyncedAt: Date | null;
  lastStatus: CalendarStatus;
  /** Why the last sync failed, in plain words; never the URL. */
  lastError: string | null;
  /** For conditional fetches. */
  etag: string | null;
  lastModified: string | null;
  createdBy: string | null;
  createdAt: Date;
};

export const eventStatuses = ["placeholder", "conflict", "linked", "gone"] as const;

/**
 * - placeholder: imported, holding its nights with a "channel" block;
 * - conflict: imported, but its unit was already taken on a night, so it
 *   holds nothing: a double booking to sort out at once;
 * - linked: completed as a booking (the booking holds the nights now);
 * - gone: was linked, and has since disappeared from the channel's calendar
 *   (cancelled there?): the booking is left alone for someone to check.
 */
export type EventStatus = (typeof eventStatuses)[number];

export type ChannelEvent = {
  id: string;
  calendarId: string;
  uid: string;
  stay: Stay;
  status: EventStatus;
  /** The booking it became, for linked and gone events. */
  bookingId: string | null;
  /** What needs a person's eye: why it conflicts, or that a linked stay's dates changed. */
  note: string | null;
  firstSeen: Date;
  lastSeen: Date;
};

export type SyncOutcome = "ok" | "not-modified" | "error";

export type SyncRun = {
  id: string;
  calendarId: string;
  startedAt: Date;
  finishedAt: Date;
  outcome: SyncOutcome;
  added: number;
  changed: number;
  removed: number;
  conflicts: number;
  error: string | null;
};

/** The hosts channel calendars may come from: the channels' own domains and their subdomains. */
export const allowedCalendarHosts = ["booking.com", "airbnb.com", "airbnb.co.za", "expedia.com", "lekkeslaap.co.za", "safarinow.com"] as const;

/** Whether `host` is one of the channels' (or a subdomain of one), and a name rather than an address. */
export function isAllowedCalendarHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (name === "" || name.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false;
  return allowedCalendarHosts.some((allowed) => name === allowed || name.endsWith(`.${allowed}`));
}

/** Why a calendar URL can't be used, or null when it can. */
export function calendarUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "Paste the whole calendar link, starting with https://.";
  }
  if (url.protocol !== "https:") return "Use the calendar link that starts with https://.";
  if (url.username || url.password) return "Paste the calendar link as the channel gives it, without a name or password in it.";
  if (url.port && url.port !== "443") return "That link uses an unusual port. Paste the calendar link exactly as the channel gives it.";
  if (!isAllowedCalendarHost(url.hostname)) {
    return "Use a calendar link from Booking.com, Airbnb, Expedia, LekkeSlaap or SafariNow. Ask Weberu to add another channel.";
  }
  return null;
}

const calendarUrl = z
  .string("Paste the calendar link.")
  .trim()
  .min(1, "Paste the calendar link.")
  .max(2000, "That link is too long. Paste the calendar link exactly as the channel gives it.")
  .superRefine((value, context) => {
    const problem = calendarUrlProblem(value);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });

export const addCalendarSchema = z.object({
  unitId: z.string("Choose the unit.").trim().min(1, "Choose the unit."),
  channel: z.string("Choose the channel.").trim().min(1, "Choose the channel.").max(32, "Choose the channel."),
  url: calendarUrl,
});

export const changeCalendarUrlSchema = z.object({ url: calendarUrl });

export const channelChangeSchema = z.object({
  name: z.string("Enter the channel's name.").trim().min(1, "Enter the channel's name.").max(40, "Keep the name under 40 characters."),
  active: z.boolean("Reload the page and try again."),
});
