import { addDays, type IsoDate } from "@/lib/format/zoned-time";

/**
 * A small iCalendar (RFC 5545) writer for a calendar that's published:
 * Booking.com, Airbnb and the other channels subscribe to a unit's feed by
 * URL and fetch it again now and then, on their own schedule. It knows the
 * format and nothing about bookings (./feed.ts decides what each event
 * says: only that the nights aren't available).
 *
 * - Lines end in CRLF and are folded at 75 octets, never inside a UTF-8
 *   character (§3.1); a continuation line starts with one space.
 * - TEXT values escape backslashes, semicolons, commas and line breaks
 *   (§3.3.11); other control characters aren't allowed, so they're dropped.
 * - Timed events are in UTC ("…Z"), so no time-zone block is needed and no
 *   app can guess the zone wrong. Whole-day events are dates, with an
 *   exclusive end: a one-day closure ends the next day (§3.6.1).
 * - Every event is busy (TRANSP:OPAQUE) and confirmed: the feed holds
 *   nothing tentative, and busy time is what channels read.
 */

/** When an event happens: a stretch of time, or whole days (both included). */
export type IcsEventTime = { kind: "timed"; start: Date; end: Date } | { kind: "all-day"; firstDay: IsoDate; lastDay: IsoDate };

export type IcsEvent = {
  /** The same for the same event on every fetch, so apps update it in place rather than add another. */
  uid: string;
  /** When the event's details last changed (DTSTAMP). */
  stamp: Date;
  time: IcsEventTime;
  summary: string;
  location: string | null;
};

export type IcsCalendar = {
  /** Who made it, as "-//Company//Product//EN". */
  productId: string;
  /** The name calendar apps show for it. */
  name: string;
  /** How often apps should fetch it again, as an ISO 8601 duration such as "PT1H". */
  refreshInterval: string;
  events: readonly IcsEvent[];
};

const maxLineOctets = 75;
const lineBreak = "\r\n";

/** The whole calendar, ready to serve as text/calendar. */
export function writeIcs(calendar: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeIcsText(calendar.productId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendar.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${calendar.refreshInterval}`,
    `X-PUBLISHED-TTL:${calendar.refreshInterval}`,
    ...calendar.events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map((line) => foldIcsLine(line) + lineBreak).join("");
}

function eventLines(event: IcsEvent): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${icsUtcTime(event.stamp)}`,
    ...timeLines(event.time),
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "TRANSP:OPAQUE",
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ];
}

function timeLines(time: IcsEventTime): string[] {
  if (time.kind === "timed") return [`DTSTART:${icsUtcTime(time.start)}`, `DTEND:${icsUtcTime(time.end)}`];
  return [`DTSTART;VALUE=DATE:${icsDate(time.firstDay)}`, `DTEND;VALUE=DATE:${icsDate(addDays(time.lastDay, 1))}`];
}

/** "20261021T040000Z": an instant in UTC, to the second. */
export function icsUtcTime(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/** "20261023" from "2026-10-23". */
export function icsDate(date: IsoDate): string {
  return date.replace(/-/g, "");
}

/** A TEXT value (RFC 5545 §3.3.11): \\, \; and \, escaped, line breaks as \n, other control characters dropped. */
export function escapeIcsText(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
  return Array.from(escaped)
    .filter((character) => isAllowedInText(character.codePointAt(0) ?? 0))
    .join("");
}

/** TEXT may hold a tab but no other control character (§3.3.11, §3.1). */
function isAllowedInText(codePoint: number): boolean {
  return codePoint === 0x09 || (codePoint >= 0x20 && codePoint !== 0x7f);
}

/**
 * A content line folded so no line is longer than 75 octets (§3.1): each
 * continuation starts with a space, which counts towards its 75. A
 * character's UTF-8 bytes always stay on one line.
 */
export function foldIcsLine(line: string): string {
  const folded: string[] = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const size = utf8Length(character.codePointAt(0) ?? 0);
    const limit = folded.length === 0 ? maxLineOctets : maxLineOctets - 1;
    if (octets + size > limit) {
      folded.push(current);
      current = "";
      octets = 0;
    }
    current += character;
    octets += size;
  }
  folded.push(current);
  return folded.join(`${lineBreak} `);
}

/** How many bytes a code point takes in UTF-8 (a lone surrogate is sent as U+FFFD, also 3). */
function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}
