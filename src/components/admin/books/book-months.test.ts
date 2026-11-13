import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earliestPeriod, isPeriod, monthHasEnded, monthsNewestFirst, shiftPeriod } from "./book-months";

describe("months of the books", () => {
  it("knows a month when it sees one", () => {
    assert.equal(isPeriod("2026-11"), true);
    assert.equal(isPeriod("2026-13"), false);
    assert.equal(isPeriod("2026-1"), false);
    assert.equal(isPeriod(null), false);
  });

  it("moves across years", () => {
    assert.equal(shiftPeriod("2026-01", -1), "2025-12");
    assert.equal(shiftPeriod("2026-12", 1), "2027-01");
    assert.equal(shiftPeriod("2026-03", -14), "2025-01");
  });

  it("lists the months from one to another, newest first", () => {
    assert.deepEqual(monthsNewestFirst("2025-12", "2026-03"), ["2026-03", "2026-02", "2026-01", "2025-12"]);
    assert.deepEqual(monthsNewestFirst("2026-03", "2026-03"), ["2026-03"]);
    assert.deepEqual(monthsNewestFirst("2026-04", "2026-03"), []);
  });

  it("says a month has ended once the next one starts", () => {
    assert.equal(monthHasEnded("2026-10", "2026-11-01"), true);
    assert.equal(monthHasEnded("2026-11", "2026-11-30"), false);
  });

  it("finds the earliest month", () => {
    assert.equal(earliestPeriod(["2026-03", null, "2025-11", "nonsense", undefined]), "2025-11");
    assert.equal(earliestPeriod([]), null);
  });
});
