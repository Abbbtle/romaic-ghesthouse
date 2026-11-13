import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRands } from "./money";
import { formatPhoneNumber, parsePhoneNumber, telHref, whatsappLink } from "./phone";
import {
  formatDateShort,
  formatDateSpan,
  formatMonth,
  formatMonthSpan,
  formatDayLong,
  formatDayMedium,
  formatDayShort,
  formatTime,
  formatTimeRange,
} from "./date-time";

describe("formatRands", () => {
  it("formats whole rands the house way", () => {
    assert.equal(formatRands(4400), "R4,400");
    assert.equal(formatRands(550), "R550");
    assert.equal(formatRands(1500000), "R1,500,000");
    assert.equal(formatRands(0), "R0");
    assert.equal(formatRands(474.6), "R475");
  });

  it("refuses non-numbers", () => {
    assert.throws(() => formatRands(Number.NaN));
  });
});

describe("parsePhoneNumber", () => {
  const sa = { ok: true, e164: "+27821234567" };

  it("reads South African numbers however they're typed", () => {
    for (const input of ["082 123 4567", "0821234567", "+27 82 123 4567", "27821234567", "+27 (0)82 123 4567", "0027 82 123 4567", "082-123-4567", " +27821234567 "]) {
      assert.deepEqual(parsePhoneNumber(input), sa, input);
    }
  });

  it("keeps other countries when the code is given", () => {
    assert.deepEqual(parsePhoneNumber("+44 20 7946 0958"), { ok: true, e164: "+442079460958" });
    assert.deepEqual(parsePhoneNumber("0044 20 7946 0958"), { ok: true, e164: "+442079460958" });
  });

  it("rejects what can't be a number", () => {
    assert.deepEqual(parsePhoneNumber(""), { ok: false, reason: "empty" });
    assert.deepEqual(parsePhoneNumber("   "), { ok: false, reason: "empty" });
    for (const input of ["hello", "082 123 456", "08212345678", "+27 0 67", "12345", "+0 123 456 789", "+27 82 123 4567 ext 2", "06+72143409"]) {
      assert.equal(parsePhoneNumber(input).ok, false, input);
    }
  });
});

describe("phone display and links", () => {
  it("formats South African numbers with spaces", () => {
    assert.equal(formatPhoneNumber("+27821234567"), "+27 82 123 4567");
    assert.equal(formatPhoneNumber("+442079460958"), "+442079460958");
  });

  it("builds tel and WhatsApp links", () => {
    assert.equal(telHref("+27821234567"), "tel:+27821234567");
    assert.equal(whatsappLink("+27821234567"), "https://wa.me/27821234567");
    assert.equal(
      whatsappLink("+27821234567", "Hi, is Fri 12 Dec free?"),
      "https://wa.me/27821234567?text=Hi%2C%20is%20Fri%2012%20Dec%20free%3F",
    );
  });
});

describe("dates and times", () => {
  it("writes dates as words", () => {
    assert.equal(formatDayShort("2026-10-20"), "Tue 20 Oct");
    assert.equal(formatDayMedium("2026-11-04"), "Wednesday 4 November");
    assert.equal(formatDayLong("2026-11-04"), "Wednesday 4 November 2026");
    assert.equal(formatDateShort("2027-01-01"), "1 Jan 2027");
  });

  it("writes date spans compactly", () => {
    assert.equal(formatDateSpan("2026-10-19", "2026-10-25"), "19–25 Oct 2026");
    assert.equal(formatMonth("2026-10"), "October 2026");
    assert.equal(formatMonthSpan("2026-10", "2026-10"), "Oct 2026");
    assert.equal(formatMonthSpan("2026-10", "2026-12"), "Oct – Dec 2026");
    assert.equal(formatMonthSpan("2026-12", "2027-02"), "Dec 2026 – Feb 2027");
    assert.equal(formatDateSpan("2026-10-26", "2026-11-01"), "26 Oct – 1 Nov 2026");
    assert.equal(formatDateSpan("2026-12-28", "2027-01-03"), "28 Dec 2026 – 3 Jan 2027");
    assert.equal(formatDateSpan("2026-10-20", "2026-10-20"), "20 Oct 2026");
  });

  it("writes 24-hour times in the business time zone", () => {
    const start = new Date("2026-10-20T04:00:00Z");
    const end = new Date("2026-10-20T05:00:00Z");
    assert.equal(formatTime(start, "Africa/Johannesburg"), "06:00");
    assert.equal(formatTimeRange(start, end, "Africa/Johannesburg"), "06:00–07:00");
  });
});
