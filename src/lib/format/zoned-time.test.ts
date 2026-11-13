import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMinutes,
  compareIsoDates,
  daysBetween,
  isIsoDate,
  isLocalTime,
  isoWeekday,
  minutesToTime,
  startOfIsoWeek,
  timeToMinutes,
  zonedDayBounds,
  zonedInstant,
  zonedParts,
  zonedToday,
} from "./zoned-time";

const joburg = "Africa/Johannesburg";
const london = "Europe/London";

describe("calendar dates", () => {
  it("recognises real dates only", () => {
    assert.equal(isIsoDate("2026-10-20"), true);
    assert.equal(isIsoDate("2028-02-29"), true);
    assert.equal(isIsoDate("2027-02-29"), false);
    assert.equal(isIsoDate("2026-13-01"), false);
    assert.equal(isIsoDate("2026-1-1"), false);
    assert.equal(isIsoDate(20261020), false);
  });

  it("adds days across months, years and leap days", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-10-20", 28), "2026-11-17");
  });

  it("counts and compares days", () => {
    assert.equal(daysBetween("2026-10-20", "2026-11-17"), 28);
    assert.equal(daysBetween("2026-11-17", "2026-10-20"), -28);
    assert.ok(compareIsoDates("2026-10-20", "2026-10-21") < 0);
    assert.equal(compareIsoDates("2026-10-20", "2026-10-20"), 0);
  });

  it("starts weeks on Monday", () => {
    assert.equal(isoWeekday("2026-10-19"), 1); // Monday
    assert.equal(isoWeekday("2026-10-25"), 7); // Sunday
    assert.equal(startOfIsoWeek("2026-10-25"), "2026-10-19");
    assert.equal(startOfIsoWeek("2026-10-19"), "2026-10-19");
    assert.equal(startOfIsoWeek("2027-01-01"), "2026-12-28");
  });
});

describe("wall-clock times", () => {
  it("converts between times and minutes", () => {
    assert.equal(timeToMinutes("06:30"), 390);
    assert.equal(minutesToTime(390), "06:30");
    assert.equal(minutesToTime(0), "00:00");
    assert.equal(minutesToTime(1439), "23:59");
    assert.throws(() => minutesToTime(1440));
    assert.throws(() => timeToMinutes("24:00"));
  });

  it("recognises 24-hour times", () => {
    assert.equal(isLocalTime("05:00"), true);
    assert.equal(isLocalTime("23:59"), true);
    assert.equal(isLocalTime("5:00"), false);
    assert.equal(isLocalTime("24:00"), false);
  });
});

describe("Johannesburg (UTC+2, no daylight saving)", () => {
  it("finds the instant of a local time", () => {
    assert.equal(zonedInstant("2026-10-20", "06:00", joburg).toISOString(), "2026-10-20T04:00:00.000Z");
    assert.equal(zonedInstant("2026-10-20", "00:30", joburg).toISOString(), "2026-10-19T22:30:00.000Z");
  });

  it("reads the local date and time of an instant", () => {
    const parts = zonedParts(new Date("2026-10-19T22:30:00Z"), joburg);
    assert.deepEqual(parts, { date: "2026-10-20", time: "00:30", weekday: 2, minutesOfDay: 30 });
  });

  it("knows today's date in Johannesburg even when UTC is still on yesterday", () => {
    assert.equal(zonedToday(new Date("2026-10-19T23:00:00Z"), joburg), "2026-10-20");
  });

  it("bounds a local day", () => {
    const { start, end } = zonedDayBounds("2026-10-20", joburg);
    assert.equal(start.toISOString(), "2026-10-19T22:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-20T22:00:00.000Z");
  });

  it("round-trips every quarter hour of a day", () => {
    for (let minutes = 0; minutes < 1440; minutes += 15) {
      const time = minutesToTime(minutes);
      assert.equal(zonedParts(zonedInstant("2026-11-04", time, joburg), joburg).time, time);
    }
  });
});

describe("zones with daylight saving", () => {
  it("handles summer and winter offsets", () => {
    assert.equal(zonedInstant("2026-07-01", "09:00", london).toISOString(), "2026-07-01T08:00:00.000Z");
    assert.equal(zonedInstant("2026-12-01", "09:00", london).toISOString(), "2026-12-01T09:00:00.000Z");
  });

  it("moves a skipped time forward by the gap", () => {
    // Clocks went from 01:00 to 02:00 on 29 March 2026: 01:30 never happened.
    const instant = zonedInstant("2026-03-29", "01:30", london);
    assert.equal(instant.toISOString(), "2026-03-29T01:30:00.000Z");
    assert.equal(zonedParts(instant, london).time, "02:30");
  });

  it("uses the earlier of a repeated time", () => {
    // Clocks went from 02:00 back to 01:00 on 25 October 2026: 01:30 happened twice.
    assert.equal(zonedInstant("2026-10-25", "01:30", london).toISOString(), "2026-10-25T00:30:00.000Z");
  });
});

describe("addMinutes", () => {
  it("adds whole minutes", () => {
    assert.equal(addMinutes(new Date("2026-10-20T04:00:00Z"), 90).toISOString(), "2026-10-20T05:30:00.000Z");
  });
});
