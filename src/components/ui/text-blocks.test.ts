import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alternatingTones } from "./section";
import { asOneParagraph, paragraphsOf } from "./text-blocks";

describe("paragraphsOf", () => {
  it("starts a new paragraph at a blank line and keeps single line breaks within one", () => {
    assert.deepEqual(paragraphsOf("First line\nsecond line\n\nNext paragraph"), [["First line", "second line"], ["Next paragraph"]]);
  });

  it("reads text typed with extra returns, spaces and Windows line endings cleanly", () => {
    assert.deepEqual(paragraphsOf("  One  \r\n\r\n\r\n   \n Two\r\nthree \n\n"), [["One"], ["Two", "three"]]);
  });

  it("has nothing to show for blank text", () => {
    assert.deepEqual(paragraphsOf("   \n\n  "), []);
  });
});

describe("asOneParagraph", () => {
  it("runs paragraphs and lines together with single spaces", () => {
    assert.equal(asOneParagraph("Line one\nline two\n\nParagraph two"), "Line one line two Paragraph two");
  });
});

describe("alternatingTones", () => {
  it("hands out white and chalk in turn from the first tone, so hidden sections never leave two alike side by side", () => {
    const fromChalk = alternatingTones("chalk");
    assert.deepEqual([fromChalk(), fromChalk(), fromChalk(), fromChalk()], ["chalk", "white", "chalk", "white"]);
    const fromWhite = alternatingTones("white");
    assert.deepEqual([fromWhite(), fromWhite()], ["white", "chalk"]);
  });

  it("starts each page's rhythm afresh", () => {
    const first = alternatingTones("chalk");
    first();
    assert.equal(alternatingTones("chalk")(), "chalk");
  });
});
