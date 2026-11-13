import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFiltered, journalQueryFrom } from "./journal-filter";

const codes = new Set(["1000", "3000"]);

describe("the journals list's filter", () => {
  it("reads dates and an account from the chart", () => {
    assert.deepEqual(journalQueryFrom({ from: "2026-10-01", until: "2026-10-31", account: "1000" }, codes), { from: "2026-10-01", until: "2026-10-31", account: "1000" });
  });

  it("leaves out what it can't read, or an account that isn't in the chart", () => {
    const query = journalQueryFrom({ from: "2026-02-30", until: "", account: "9999" }, codes);
    assert.deepEqual(query, { from: null, until: null, account: null });
    assert.equal(isFiltered(query), false);
  });

  it("swaps dates given the wrong way round, and takes the first of repeated values", () => {
    assert.deepEqual(journalQueryFrom({ from: ["2026-10-31", "2026-01-01"], until: "2026-10-01" }, codes), { from: "2026-10-01", until: "2026-10-31", account: null });
  });
});
