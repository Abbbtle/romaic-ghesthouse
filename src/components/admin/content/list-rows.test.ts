import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRow, moveRow, removeRow, rowHeading, rowName, rowsOf } from "./list-rows";

const rows = rowsOf(["Strength", "Conditioning", "Mobility"]);
const items = (list: readonly { item: string }[]) => list.map((row) => row.item);

describe("list editor rows", () => {
  it("keys the saved rows, so a moved row keeps its fields", () => {
    assert.deepEqual(rows, [
      { key: "saved-0", item: "Strength", added: false },
      { key: "saved-1", item: "Conditioning", added: false },
      { key: "saved-2", item: "Mobility", added: false },
    ]);
  });

  it("swaps a row with its neighbour, and leaves the ends alone", () => {
    assert.deepEqual(items(moveRow(rows, 0, 1)), ["Conditioning", "Strength", "Mobility"]);
    assert.deepEqual(items(moveRow(rows, 2, -1)), ["Strength", "Mobility", "Conditioning"]);
    assert.deepEqual(items(moveRow(rows, 0, -1)), ["Strength", "Conditioning", "Mobility"]);
    assert.deepEqual(items(moveRow(rows, 2, 1)), ["Strength", "Conditioning", "Mobility"]);
    assert.equal(moveRow(rows, 0, 1)[1]?.key, "saved-0", "the row keeps its key");
  });

  it("removes a row and adds one at the end, marked as added", () => {
    assert.deepEqual(items(removeRow(rows, 1)), ["Strength", "Mobility"]);
    assert.deepEqual(addRow(rows, "", "added-1").at(-1), { key: "added-1", item: "", added: true });
  });

  it("names rows by position for buttons and headings", () => {
    assert.equal(rowName("focus area", 1), "focus area 2");
    assert.equal(rowHeading("focus area", 1), "Focus area 2");
  });
});
