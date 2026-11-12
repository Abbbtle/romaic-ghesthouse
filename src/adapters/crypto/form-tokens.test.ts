import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formTimingOf } from "@/lib/booking/spam-rules";
import { createFormTokens } from "./form-tokens";
import { createTokenSigner } from "./hmac";
import { cryptoRandom } from "./random-source";

const secret = "a long random test secret";
const shownAt = new Date("2026-11-02T06:00:00.123Z");

describe("createFormTokens", () => {
  it("gives back the time a form was shown, to the millisecond", () => {
    const tokens = createFormTokens(createTokenSigner(secret, "booking-form"));
    assert.deepEqual(tokens.verify(tokens.sign(shownAt)), shownAt);
  });

  it("puts nothing in a token but the time", () => {
    const token = createFormTokens(createTokenSigner(secret, "booking-form")).sign(shownAt);
    const [payload] = token.split(".");
    assert.equal(Buffer.from(payload ?? "", "base64url").toString("utf8"), String(shownAt.getTime()));
  });

  it("refuses a changed, forged or foreign token", () => {
    const tokens = createFormTokens(createTokenSigner(secret, "booking-form"));
    const token = tokens.sign(shownAt);
    const [payload, signature] = token.split(".");
    const earlier = Buffer.from(String(shownAt.getTime() - 60_000), "utf8").toString("base64url");
    assert.equal(tokens.verify(`${earlier}.${signature}`), null, "an earlier time with the old signature");
    assert.equal(tokens.verify(`${payload}.`), null, "no signature");
    assert.equal(tokens.verify("garbage"), null);
    assert.equal(tokens.verify(""), null);
    assert.equal(createFormTokens(createTokenSigner("another secret", "booking-form")).verify(token), null, "another server's secret");
    assert.equal(createFormTokens(createTokenSigner(secret, "something-else")).verify(token), null, "a token for another purpose");
  });

  it("refuses a genuine token whose payload isn't a time", () => {
    const signer = createTokenSigner(secret, "booking-form");
    const tokens = createFormTokens(signer);
    assert.equal(tokens.verify(signer.sign("tomorrow")), null);
    assert.equal(tokens.verify(signer.sign("-5")), null);
    assert.equal(tokens.verify(signer.sign("1".repeat(20))), null);
  });

  it("works with the booking core's timing rules", () => {
    const tokens = createFormTokens(createTokenSigner(secret, "booking-form"));
    const token = tokens.sign(shownAt);
    assert.equal(formTimingOf(tokens.verify(token), new Date(shownAt.getTime() + 1000)), "too-fast");
    assert.equal(formTimingOf(tokens.verify(token), new Date(shownAt.getTime() + 60_000)), "fine");
    assert.equal(formTimingOf(tokens.verify(token), new Date(shownAt.getTime() + 25 * 60 * 60 * 1000)), "stale");
  });
});

describe("cryptoRandom", () => {
  it("gives whole numbers from 0 up to, but not including, the limit, all of them in time", () => {
    const seen = new Set<number>();
    for (let draw = 0; draw < 2000; draw++) {
      const value = cryptoRandom.randomInt(31);
      assert.ok(Number.isInteger(value) && value >= 0 && value < 31, `${value} is out of range`);
      seen.add(value);
    }
    assert.equal(seen.size, 31);
  });
});
