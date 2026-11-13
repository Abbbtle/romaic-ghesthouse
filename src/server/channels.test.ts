import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { feedChannel, feedResponse, feedTokenPattern } from "./channels";

const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

describe("the calendar feed endpoint", () => {
  it("serves the feed as text/calendar, kept privately for five minutes at most, never indexed", async () => {
    const response = feedResponse(ics, null);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "private, max-age=300");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(await response.text(), ics);
  });

  it("answers 304 for a copy that's still current", () => {
    const etag = feedResponse(ics, null).headers.get("etag");
    assert.ok(etag);
    assert.equal(feedResponse(ics, etag).status, 304);
    assert.equal(feedResponse(ics, `W/${etag}`).status, 304);
    assert.equal(feedResponse(`${ics} `, etag).status, 200);
  });

  it("answers 404, never cached, for an unknown link", () => {
    const response = feedResponse(null, null);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("looks up only well-formed tokens and channel keys", () => {
    assert.equal(feedTokenPattern.test("A".repeat(43)), true);
    assert.equal(feedTokenPattern.test("A".repeat(42)), false);
    assert.equal(feedTokenPattern.test(`${"A".repeat(42)}/`), false);
    assert.equal(feedChannel("booking-com"), "booking-com");
    assert.equal(feedChannel(null), null);
    assert.equal(feedChannel("Booking.com"), null);
    assert.equal(feedChannel("x".repeat(33)), null);
  });
});
