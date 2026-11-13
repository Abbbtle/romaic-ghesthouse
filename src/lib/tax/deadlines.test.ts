import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { byDeadline, dueDayText, isLate, lateText } from "./deadlines";

const today = "2026-11-12";

describe("late returns", () => {
  it("are late once the due day has passed and they aren't filed", () => {
    assert.equal(isLate("2026-11-06", "draft", today), true, "the October EMP201, due Fri 6 Nov, still a draft");
    assert.equal(isLate("2026-08-31", "reviewed", today), true, "the first IRP6, reviewed but never filed");
    assert.equal(isLate("2026-11-06", null, today), true, "not prepared at all");
  });

  it("aren't late on the due day itself, before it, once filed, or without a due date", () => {
    assert.equal(isLate("2026-11-12", "draft", today), false, "due today");
    assert.equal(isLate("2026-11-30", "draft", today), false);
    assert.equal(isLate("2026-11-06", "filed", today), false);
    assert.equal(isLate(null, "draft", today), false, "turnover tax has no due date here");
  });

  it("say when they were due, with the year only when it isn't this year's", () => {
    assert.equal(lateText("2026-11-06", today), "Late: was due Fri 6 Nov");
    assert.equal(lateText("2025-08-29", today), "Late: was due 29 Aug 2025");
    assert.equal(dueDayText("2027-02-26", today), "26 Feb 2027");
  });

  it("split the overview into late (most overdue first) and coming up (today on), leaving out what's filed and past", () => {
    const item = (dueOn: string, status: "draft" | "reviewed" | "filed" | null, label: string) => ({ dueOn, status, label });
    const { late, comingUp } = byDeadline(
      [item("2026-11-30", null, "VAT201"), item("2026-11-06", "draft", "EMP201 Oct"), item("2026-08-31", "draft", "IRP6 first"), item("2026-10-07", "filed", "EMP201 Sep"), item("2026-11-12", null, "due today")],
      today,
    );
    assert.deepEqual(
      late.map((entry) => entry.label),
      ["IRP6 first", "EMP201 Oct"],
    );
    assert.deepEqual(
      comingUp.map((entry) => entry.label),
      ["due today", "VAT201"],
    );
  });
});
