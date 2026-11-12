import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capitalised, whenLabel } from "./when-label";

const zone = "Africa/Johannesburg";
// 09:30 on Wednesday 21 October 2026 in Johannesburg.
const now = new Date("2026-10-21T07:30:00Z");

describe("whenLabel", () => {
  it("says today or yesterday with the time, in Johannesburg's time", () => {
    assert.equal(whenLabel(new Date("2026-10-21T05:02:00Z"), now, zone), "today at 07:02");
    // 23:15 UTC on the 20th is already 01:15 on the 21st in Johannesburg.
    assert.equal(whenLabel(new Date("2026-10-20T23:15:00Z"), now, zone), "today at 01:15");
    assert.equal(whenLabel(new Date("2026-10-20T07:15:00Z"), now, zone), "yesterday at 09:15");
  });

  it("names the day further back, with the year once it's another one", () => {
    assert.equal(whenLabel(new Date("2026-10-13T10:00:00Z"), now, zone), "Tue 13 Oct");
    assert.equal(whenLabel(new Date("2025-12-31T10:00:00Z"), now, zone), "31 Dec 2025");
  });

  it("starts a line with a capital", () => {
    assert.equal(capitalised("today at 07:02"), "Today at 07:02");
  });
});
