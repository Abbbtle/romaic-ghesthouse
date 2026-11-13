import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base32Decode, base32Encode, hotp, rfc6238Authenticator, totpAt, totpStep } from "./totp";

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII string "12345678901234567890".
const seed = new TextEncoder().encode("12345678901234567890");

describe("TOTP (RFC 6238)", () => {
  // The appendix lists 8-digit codes; authenticator apps show the last 6.
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [seconds, code] of vectors) {
    it(`matches the RFC's code at T=${seconds}`, () => {
      const at = new Date(seconds * 1000);
      assert.equal(hotp(seed, totpStep(at), 8), code);
      assert.equal(totpAt(seed, at), code.slice(-6));
    });
  }

  it("round-trips Base32 (RFC 4648) and ignores spaces, hyphens and case", () => {
    const secret = base32Encode(seed);
    assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    assert.deepEqual(base32Decode(secret.toLowerCase().replace(/(.{4})/g, "$1 ")), seed);
    assert.equal(base32Decode("not base32!"), null);
  });

  it("accepts the code for now and a step either side, and says which step matched", () => {
    const secret = base32Encode(seed);
    const at = new Date(1111111111 * 1000);
    const step = totpStep(at);
    assert.deepEqual(rfc6238Authenticator.verify(secret, totpAt(seed, at), at), { step });
    assert.deepEqual(rfc6238Authenticator.verify(secret, totpAt(seed, new Date(at.getTime() - 30_000)), at), { step: step - 1 });
    assert.equal(rfc6238Authenticator.verify(secret, totpAt(seed, new Date(at.getTime() - 90_000)), at), null);
    assert.equal(rfc6238Authenticator.verify(secret, "12345", at), null, "six digits only");
  });

  it("makes 160-bit secrets and a standard otpauth link", () => {
    const secret = rfc6238Authenticator.newSecret();
    assert.equal(base32Decode(secret)?.length, 20);
    const uri = new URL(rfc6238Authenticator.provisioningUri(secret, "owner@example.com", "Romaic Guesthouse"));
    assert.equal(uri.protocol, "otpauth:");
    assert.equal(uri.searchParams.get("secret"), secret);
    assert.equal(uri.searchParams.get("issuer"), "Romaic Guesthouse");
    assert.equal(uri.searchParams.get("digits"), "6");
    assert.equal(uri.searchParams.get("period"), "30");
  });
});
