import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testBlock } from "@/lib/inventory/testing/store-contract";
import { chartNights, chartRow } from "./chart-rows";

const shape = (cells: ReturnType<typeof chartRow>) => cells.map((cell) => (cell.kind === "free" ? cell.night.slice(8) : `${cell.block.id}:${cell.nights}${cell.startsBefore ? "<" : ""}${cell.endsAfter ? ">" : ""}`));

describe("the availability chart's rows", () => {
  it("lists the nights from the first up to the last", () => {
    assert.deepEqual(chartNights("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("spans each block across its nights and fills the rest with free nights", () => {
    const blocks = [testBlock("b", "u1", "2026-12-03", "2026-12-05"), testBlock("other", "u2", "2026-12-01", "2026-12-07")];
    assert.deepEqual(shape(chartRow("u1", blocks, "2026-12-01", "2026-12-07")), ["01", "02", "b:2", "05", "06"]);
  });

  it("clips blocks that start before or run past the chart, and keeps back-to-back stays apart", () => {
    const blocks = [testBlock("early", "u1", "2026-11-28", "2026-12-02"), testBlock("next", "u1", "2026-12-02", "2026-12-04"), testBlock("late", "u1", "2026-12-06", "2026-12-20")];
    assert.deepEqual(shape(chartRow("u1", blocks, "2026-12-01", "2026-12-08")), ["early:1<", "next:2", "04", "05", "late:2>"]);
  });

  it("skips a block that overlaps one already drawn", () => {
    const blocks = [testBlock("a", "u1", "2026-12-01", "2026-12-04"), testBlock("b", "u1", "2026-12-02", "2026-12-03")];
    assert.deepEqual(shape(chartRow("u1", blocks, "2026-12-01", "2026-12-05")), ["a:3", "04"]);
  });
});
