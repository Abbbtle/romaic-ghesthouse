import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tooManyMessage, windowLength } from "./rate-limit";

describe("rate limit messages", () => {
  it("say how long to wait in words, rounding up", () => {
    assert.equal(windowLength(60 * 1000), "a minute");
    assert.equal(windowLength(15 * 60 * 1000), "15 minutes");
    assert.equal(windowLength(60 * 60 * 1000), "an hour");
    assert.equal(windowLength(90 * 60 * 1000), "2 hours");
    assert.equal(windowLength(7 * 24 * 60 * 60 * 1000), "7 days");
    assert.equal(windowLength(10 * 1000), "a minute");
  });

  it("follow the limit's own window, so a longer limit never claims a shorter wait", () => {
    assert.equal(tooManyMessage({ scope: "s", maxAttempts: 8, windowMs: 15 * 60 * 1000 }), "Too many attempts. Wait 15 minutes, then try again.");
    assert.equal(tooManyMessage({ scope: "s", maxAttempts: 5, windowMs: 60 * 60 * 1000 }, "emails"), "Too many emails. Wait an hour, then try again.");
  });
});
