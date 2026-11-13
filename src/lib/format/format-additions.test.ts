import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMonths } from "./zoned-time";
import { formatDayMonth } from "./date-time";

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    assert.equal(addMonths("2026-10-20", 1), "2026-11-20");
    assert.equal(addMonths("2026-10-20", -24), "2024-10-20");
    assert.equal(addMonths("2026-10-20", 15), "2028-01-20");
  });

  it("moves a day the target month lacks to its last day", () => {
    assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
    assert.equal(addMonths("2028-03-31", -1), "2028-02-29");
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  });

  it("refuses fractions of a month", () => {
    assert.throws(() => addMonths("2026-10-20", 1.5));
  });
});

describe("formatDayMonth", () => {
  it("prints the day and short month only", () => {
    assert.equal(formatDayMonth("2026-11-04"), "4 Nov");
    assert.equal(formatDayMonth("2027-12-27"), "27 Dec");
  });
});
