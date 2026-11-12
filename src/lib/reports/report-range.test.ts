import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReportRange, maxRangeDays, monthsOf, nightsWithin, rangeDays, weeksOf } from "./report-range";

describe("a report's dates", () => {
  it("count both ends", () => {
    assert.equal(rangeDays({ from: "2026-11-01", until: "2026-11-30" }), 30);
    assert.equal(rangeDays({ from: "2026-11-13", until: "2026-11-13" }), 1);
  });

  it("must be real dates, the right way round, and at most a year with its leap day", () => {
    assert.equal(isReportRange({ from: "2026-11-01", until: "2026-11-30" }), true);
    assert.equal(isReportRange({ from: "2026-11-30", until: "2026-11-01" }), false);
    assert.equal(isReportRange({ from: "2026-02-30", until: "2026-03-01" }), false);
    assert.equal(isReportRange({ from: "yesterday", until: "2026-03-01" }), false);
    assert.equal(isReportRange({ from: "2027-03-01", until: "2028-02-29" }), true, "a leap financial year fits");
    assert.equal(rangeDays({ from: "2027-03-01", until: "2028-02-29" }), maxRangeDays);
    assert.equal(isReportRange({ from: "2027-03-01", until: "2028-03-01" }), false);
  });
});

describe("a stay's nights within a report's dates", () => {
  const range = { from: "2026-11-01", until: "2026-11-30" };

  it("counts the nights from arrival up to, not including, the leaving day", () => {
    assert.equal(nightsWithin({ arrive: "2026-11-10", leave: "2026-11-13" }, range), 3);
  });

  it("cuts a stay at the range's ends: the last day's night counts, the night after doesn't", () => {
    assert.equal(nightsWithin({ arrive: "2026-10-30", leave: "2026-11-02" }, range), 1);
    assert.equal(nightsWithin({ arrive: "2026-11-29", leave: "2026-12-03" }, range), 2);
    assert.equal(nightsWithin({ arrive: "2026-10-20", leave: "2026-12-20" }, range), 30);
  });

  it("gives nothing for a stay leaving on the first day or arriving after the last", () => {
    assert.equal(nightsWithin({ arrive: "2026-10-28", leave: "2026-11-01" }, range), 0);
    assert.equal(nightsWithin({ arrive: "2026-12-01", leave: "2026-12-03" }, range), 0);
  });
});

describe("months and weeks in a report's dates", () => {
  it("cuts the first and last month to the range and says which are whole", () => {
    assert.deepEqual(monthsOf({ from: "2026-10-15", until: "2026-12-31" }), [
      { key: "2026-10", from: "2026-10-15", until: "2026-10-31", days: 17, whole: false },
      { key: "2026-11", from: "2026-11-01", until: "2026-11-30", days: 30, whole: true },
      { key: "2026-12", from: "2026-12-01", until: "2026-12-31", days: 31, whole: true },
    ]);
    assert.deepEqual(monthsOf({ from: "2028-02-01", until: "2028-02-29" }), [{ key: "2028-02", from: "2028-02-01", until: "2028-02-29", days: 29, whole: true }]);
  });

  it("starts weeks on Monday, keyed by their Monday", () => {
    // 1 Nov 2026 is a Sunday.
    assert.deepEqual(weeksOf({ from: "2026-11-01", until: "2026-11-16" }), [
      { key: "2026-10-26", from: "2026-11-01", until: "2026-11-01", days: 1, whole: false },
      { key: "2026-11-02", from: "2026-11-02", until: "2026-11-08", days: 7, whole: true },
      { key: "2026-11-09", from: "2026-11-09", until: "2026-11-15", days: 7, whole: true },
      { key: "2026-11-16", from: "2026-11-16", until: "2026-11-16", days: 1, whole: false },
    ]);
  });
});
