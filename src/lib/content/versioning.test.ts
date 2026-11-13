import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextVersion, reviseSection } from "./versioning";
import { sampleContent } from "./testing/sample-content";

const today = "2026-11-12";

describe("nextVersion", () => {
  it("moves the last number on", () => {
    assert.equal(nextVersion("1.0"), "1.1");
    assert.equal(nextVersion("1.9"), "1.10");
    assert.equal(nextVersion("3"), "4");
    assert.equal(nextVersion("2.0.7"), "2.0.8");
  });
});

describe("reviseSection", () => {
  it("gives a changed privacy notice the next version and today's date", () => {
    const previous = sampleContent().privacy;
    const next = { ...previous, body: `${previous.body}\n\nMore.` };
    assert.deepEqual(reviseSection("privacy", previous, next, today), { ...next, version: "0.2", updatedOn: today });
  });

  it("keeps a privacy version and date the editor set, and leaves an unchanged notice alone", () => {
    const previous = sampleContent().privacy;
    const set = { ...previous, body: "Rewritten.", version: "2.0", updatedOn: "2026-10-30" };
    assert.deepEqual(reviseSection("privacy", previous, set, today), set);
    const retitled = { ...previous, heading: "Privacy policy" };
    assert.deepEqual(reviseSection("privacy", previous, retitled, today), retitled);
  });

  it("leaves other sections as they are", () => {
    const previous = sampleContent().site;
    const next = { ...previous, description: "Somewhere else." };
    assert.equal(reviseSection("site", previous, next, today), next);
  });
});
