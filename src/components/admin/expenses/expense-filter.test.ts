import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expenseQueryFrom, isFiltered, monthOf } from "./expense-filter";

const suppliers = new Set(["00000000-0000-4000-8000-0000000000s1"]);
const accounts = new Set(["5500", "1500"]);

describe("the expenses list's filter", () => {
  it("shows this month when no dates are given", () => {
    const query = expenseQueryFrom({}, "2026-11-12", suppliers, accounts);
    assert.deepEqual(query, { from: "2026-11-01", until: "2026-11-30", supplier: null, account: null, dated: true });
    assert.equal(isFiltered(query, "2026-11-12"), false);
    assert.deepEqual(monthOf("2028-02-10"), { from: "2028-02-01", until: "2028-02-29" });
  });

  it("keeps only real dates, in order, and suppliers and accounts that exist", () => {
    assert.deepEqual(expenseQueryFrom({ from: "2026-11-30", until: "2026-11-01", supplier: "nobody", account: "5500" }, "2026-11-12", suppliers, accounts), {
      from: "2026-11-01",
      until: "2026-11-30",
      supplier: null,
      account: "5500",
      dated: true,
    });
    assert.deepEqual(expenseQueryFrom({ from: "2026-02-31", until: "2026-10-31" }, "2026-11-12", suppliers, accounts).from, null);
    assert.equal(isFiltered(expenseQueryFrom({ account: "5500" }, "2026-11-12", suppliers, accounts), "2026-11-12"), true);
  });

  it("can show every date", () => {
    const query = expenseQueryFrom({ dates: "all", from: "2026-01-01" }, "2026-11-12", suppliers, accounts);
    assert.deepEqual([query.from, query.until, query.dated], [null, null, false]);
  });
});
