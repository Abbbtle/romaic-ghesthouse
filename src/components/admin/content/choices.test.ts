import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freeSlug, slugFrom } from "./choices";

describe("link names made from names", () => {
  it("makes a name into lower-case words joined by dashes", () => {
    assert.equal(slugFrom("Thandi K."), "thandi-k");
    assert.equal(slugFrom("  Élite   Transform! "), "elite-transform");
    assert.equal(slugFrom("1:1 personal training"), "1-1-personal-training");
    assert.equal(slugFrom("✨"), "");
    assert.equal(slugFrom("a".repeat(60)).length, 48);
  });

  it("adds a number when the name is taken, and falls back when nothing in it can be used", () => {
    assert.equal(freeSlug("Duo", ["duo"], "group"), "duo-2");
    assert.equal(freeSlug("Duo", ["duo", "duo-2"], "group"), "duo-3");
    assert.equal(freeSlug("", [], "group"), "group");
    assert.equal(freeSlug("", ["group"], "group"), "group-2");
  });
});
