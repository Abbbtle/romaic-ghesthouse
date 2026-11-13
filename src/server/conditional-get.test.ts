import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesIfNoneMatch } from "./conditional-get";

describe("matchesIfNoneMatch", () => {
  it("compares tags weakly, takes lists and *, and matches nothing without a header", () => {
    assert.equal(matchesIfNoneMatch(null, '"a1"'), false);
    assert.equal(matchesIfNoneMatch('"a1"', '"a1"'), true);
    assert.equal(matchesIfNoneMatch('W/"a1"', '"a1"'), true);
    assert.equal(matchesIfNoneMatch(' "a0" , "a1" ', '"a1"'), true);
    assert.equal(matchesIfNoneMatch("*", '"a1"'), true);
    assert.equal(matchesIfNoneMatch('"a10"', '"a1"'), false);
    assert.equal(matchesIfNoneMatch("", '"a1"'), false);
  });
});
