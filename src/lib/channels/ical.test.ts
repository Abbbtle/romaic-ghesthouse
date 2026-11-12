import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { testBlock } from "@/lib/inventory/testing/store-contract";
import { calendarUrlProblem, isAllowedCalendarHost } from "./channels";
import { unitFeedIcs } from "./feed";
import { parseIcal } from "./ical-parser";
import { escapeIcsText, foldIcsLine, writeIcs } from "./ics";

describe("reading a channel's calendar", () => {
  it("reads all-day and timed events, with LF or CRLF lines, folded lines and parameters", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1418fb94e984-f6aba25a0ff37c4c0b3c3ae4a2f8b4f6@booki",
      " ng.com",
      "DTSTART;VALUE=DATE:20261210",
      "DTEND;VALUE=DATE:20261213",
      "SUMMARY:CLOSED - Not available",
      "END:VEVENT",
      "BEGIN:VEVENT",
      'UID;X-NOTE="a:b":airbnb-1',
      "DTSTART;TZID=Africa/Johannesburg:20261220T140000",
      "DTEND:20261222T100000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    for (const separator of ["\r\n", "\n"]) {
      assert.deepEqual(parseIcal(text.join(separator)), {
        events: [
          { uid: "1418fb94e984-f6aba25a0ff37c4c0b3c3ae4a2f8b4f6@booking.com", stay: { arrive: "2026-12-10", leave: "2026-12-13" } },
          { uid: "airbnb-1", stay: { arrive: "2026-12-20", leave: "2026-12-22" } },
        ],
        skipped: 0,
        truncated: false,
      });
    }
  });

  it("counts a missing end as one night, and skips events it can't read, never the whole calendar", () => {
    const event = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
    const text = [
      "BEGIN:VCALENDAR",
      ...event(["UID:one-night", "DTSTART;VALUE=DATE:20261210"]),
      ...event(["UID:backwards", "DTSTART;VALUE=DATE:20261213", "DTEND;VALUE=DATE:20261210"]),
      ...event(["UID:no-start", "DTEND;VALUE=DATE:20261210"]),
      ...event(["DTSTART;VALUE=DATE:20261210", "DTEND;VALUE=DATE:20261211"]),
      ...event(["UID:not-a-date", "DTSTART;VALUE=DATE:20261332", "DTEND;VALUE=DATE:20261402"]),
      ...event(["UID:too-long", "DTSTART;VALUE=DATE:20260101", "DTEND;VALUE=DATE:20270201"]),
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseIcal(text);
    assert.deepEqual(parsed.events, [{ uid: "one-night", stay: { arrive: "2026-12-10", leave: "2026-12-11" } }]);
    assert.equal(parsed.skipped, 5);
  });

  it("keeps the last of a repeated UID, caps UIDs, and stops at the most events it reads", () => {
    const event = (uid: string, day: number) => ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:202612${String(day).padStart(2, "0")}`, "END:VEVENT"];
    const text = ["BEGIN:VCALENDAR", ...event("same", 1), ...event("same", 2), ...event("x".repeat(400), 3), ...event("fourth", 4), "END:VCALENDAR"].join("\n");
    const all = parseIcal(text);
    assert.deepEqual(all.events.map((imported) => [imported.uid.length, imported.stay.arrive]), [[4, "2026-12-02"], [255, "2026-12-03"], [6, "2026-12-04"]]);
    const cut = parseIcal(text, 2);
    assert.equal(cut.truncated, true);
    assert.deepEqual(cut.events.map((imported) => imported.stay.arrive), ["2026-12-02"]);
  });

  it("ignores what isn't a calendar", () => {
    assert.deepEqual(parseIcal("<html><body>Sign in</body></html>"), { events: [], skipped: 0, truncated: false });
  });
});

describe("calendar links", () => {
  it("must be https links from the channels' own domains, never an address or another port", () => {
    assert.equal(isAllowedCalendarHost("admin.booking.com"), true);
    assert.equal(isAllowedCalendarHost("www.airbnb.co.za"), true);
    assert.equal(isAllowedCalendarHost("booking.com.evil.example"), false);
    assert.equal(isAllowedCalendarHost("notbooking.com"), false);
    assert.equal(isAllowedCalendarHost("127.0.0.1"), false);
    assert.equal(isAllowedCalendarHost("[::1]"), false);
    assert.equal(calendarUrlProblem("https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc"), null);
    assert.match(calendarUrlProblem("http://admin.booking.com/x") ?? "", /https/);
    assert.match(calendarUrlProblem("https://admin.booking.com:8443/x") ?? "", /port/);
    assert.match(calendarUrlProblem("https://me:pw@admin.booking.com/x") ?? "", /password/);
    assert.match(calendarUrlProblem("https://example.com/x.ics") ?? "", /Booking\.com, Airbnb/);
  });
});

describe("writing iCalendar", () => {
  it("escapes text and folds long lines at 75 octets without splitting a character", () => {
    assert.equal(escapeIcsText("a;b,c\\d\ne\u0007"), "a\\;b\\,c\\\\d\\ne");
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
    assert.equal(folded.split("\r\n").map((line, index) => (index === 0 ? line : line.slice(1))).join(""), `SUMMARY:${"é".repeat(60)}`);
  });

  it("ends every line with CRLF", () => {
    const text = writeIcs({ productId: "-//Test//EN", name: "Test", refreshInterval: "PT1H", events: [] });
    assert.ok(text.endsWith("END:VCALENDAR\r\n"));
    assert.equal(text.split("\r\n").filter((line) => line.includes("\n")).length, 0);
  });
});

describe("a unit's export feed", () => {
  const block = (id: string, arrive: string, leave: string, reason: "owner" | "channel" | "booking", note: string | null) => ({ ...testBlock(id, "u1", arrive, leave, reason), note });

  it("says only Not available, as all-day events with stable UIDs, and leaves out the asking channel's own stays", () => {
    const blocks = [
      { block: block("00000000-0000-4000-8000-000000000b01", "2026-12-10", "2026-12-13", "channel", "Booking.com stay"), channel: "booking-com" },
      { block: block("00000000-0000-4000-8000-000000000b02", "2026-12-20", "2026-12-21", "owner", "Painting the bathroom"), channel: null },
      { block: block("00000000-0000-4000-8000-000000000b03", "2026-12-24", "2026-12-27", "booking", "Guest: Thandi"), channel: null },
    ];
    const everything = unitFeedIcs({ blocks, forChannel: null });
    assert.equal(everything.match(/BEGIN:VEVENT/g)?.length, 3);
    assert.match(everything, /UID:00000000-0000-4000-8000-000000000b02@romaic-guesthouse\r\n/);
    assert.match(everything, /DTSTART;VALUE=DATE:20261220\r\nDTEND;VALUE=DATE:20261221\r\n/);
    assert.doesNotMatch(everything, /Painting|Thandi|Booking\.com stay|owner|booking-com/);
    assert.equal(unitFeedIcs({ blocks, forChannel: null }), everything, "the same nights give the same feed");
    const forBooking = unitFeedIcs({ blocks, forChannel: "booking-com" });
    assert.equal(forBooking.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.doesNotMatch(forBooking, /20261210/);
  });
});
