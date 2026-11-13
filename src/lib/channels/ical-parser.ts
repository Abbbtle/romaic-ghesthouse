import { addDays, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";

/**
 * Reads the calendars channels publish (Booking.com, Airbnb and the rest):
 * an RFC 5545 subset, as tolerantly as the real feeds need. Only VEVENTs
 * with a UID and a start are read; everything else is ignored.
 *
 * - Lines may end in CRLF or LF; a line starting with a space or tab
 *   continues the one before (§3.1, unfolding).
 * - DTSTART and DTEND may be dates ("20261210", VALUE=DATE) or date-times
 *   ("20261210T140000Z" or floating); a date-time counts by its calendar
 *   date, since a stay is nights, not hours. A missing DTEND means one night.
 * - An end on or before the start, a stay longer than a year, or a date that
 *   isn't real makes the event skipped, never the whole calendar.
 * - At most `maxEvents` events are read: a feed bigger than that is cut, and
 *   says so, rather than letting one calendar take the server down.
 *
 * Events carry no names, prices or guests: iCal from channels is dates only.
 */

export type ImportedEvent = { uid: string; stay: Stay };

export type ParsedCalendar = {
  events: ImportedEvent[];
  /** Events skipped because their dates couldn't be read. */
  skipped: number;
  /** Whether the feed had more events than were read. */
  truncated: boolean;
};

export const maxImportedEvents = 2_000;

const maxStayNights = 366;

/** The calendar's content lines, unfolded. */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  return lines;
}

/** "DTSTART;VALUE=DATE:20261210" → { name: "DTSTART", value: "20261210" }. Parameters are dropped; quoted colons inside them are respected. */
function contentLine(line: string): { name: string; value: string } | null {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') inQuotes = !inQuotes;
    else if (character === ":" && !inQuotes) {
      const name = line.slice(0, index).split(";", 1)[0]!.trim().toUpperCase();
      return { name, value: line.slice(index + 1).trim() };
    }
  }
  return null;
}

/** "20261210" or "20261210T140000Z" → "2026-12-10", or null. */
function dateOf(value: string): IsoDate | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/.exec(value);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return isIsoDate(date) ? date : null;
}

/** An imported UID, unescaped and capped, so a hostile feed can't store an essay. */
function uidOf(value: string): string | null {
  const uid = value.replace(/\\([\\;,nN])/g, (_match, escaped: string) => (escaped === "n" || escaped === "N" ? " " : escaped)).trim();
  return uid.length > 0 ? uid.slice(0, 255) : null;
}

export function parseIcal(text: string, maxEvents = maxImportedEvents): ParsedCalendar {
  const events: ImportedEvent[] = [];
  let skipped = 0;
  let truncated = false;
  let current: { uid: string | null; start: IsoDate | null; end: IsoDate | null; bad: boolean } | null = null;

  for (const line of unfold(text)) {
    const parsed = contentLine(line);
    if (!parsed) continue;
    const { name, value } = parsed;
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = { uid: null, start: null, end: null, bad: false };
      continue;
    }
    if (!current) continue;
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      const { uid, start, bad } = current;
      const end = current.end ?? (start ? addDays(start, 1) : null);
      current = null;
      if (bad || !uid || !start || !end || end <= start || daysBetweenSafe(start, end) > maxStayNights) {
        skipped += 1;
        continue;
      }
      if (events.length >= maxEvents) {
        truncated = true;
        continue;
      }
      events.push({ uid, stay: { arrive: start, leave: end } });
      continue;
    }
    if (name === "UID") current.uid = uidOf(value);
    else if (name === "DTSTART") {
      current.start = dateOf(value);
      if (!current.start) current.bad = true;
    } else if (name === "DTEND") {
      current.end = dateOf(value);
      if (!current.end) current.bad = true;
    }
  }

  // One UID once: a feed that repeats one keeps the last.
  const byUid = new Map(events.map((event) => [event.uid, event]));
  return { events: [...byUid.values()], skipped, truncated };
}

function daysBetweenSafe(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
