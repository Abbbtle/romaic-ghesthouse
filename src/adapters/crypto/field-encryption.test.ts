import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFieldCipher, FieldEncryptionError, newDataKeyEntry, parseDataKeys } from "./field-encryption";
import { scryptParameters } from "./passwords";

describe("field encryption (AES-256-GCM)", () => {
  const keys = parseDataKeys(newDataKeyEntry("k1"));

  it("round-trips a value in its context, with a fresh nonce each time", () => {
    const cipher = createFieldCipher(keys);
    const first = cipher.encrypt("JBSWY3DPEHPK3PXP", "mfa-totp:account-1");
    const second = cipher.encrypt("JBSWY3DPEHPK3PXP", "mfa-totp:account-1");
    assert.notEqual(first, second);
    assert.match(first, /^v1\.k1\./);
    assert.equal(cipher.decrypt(first, "mfa-totp:account-1"), "JBSWY3DPEHPK3PXP");
  });

  it("refuses a value moved to another record, or changed at all", () => {
    const cipher = createFieldCipher(keys);
    const stored = cipher.encrypt("secret", "mfa-totp:account-1");
    assert.throws(() => cipher.decrypt(stored, "mfa-totp:account-2"), FieldEncryptionError);
    const parts = stored.split(".");
    const flipped = parts[3]!.startsWith("A") ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`;
    assert.throws(() => cipher.decrypt([...parts.slice(0, 3), flipped, parts[4]].join("."), "mfa-totp:account-1"), FieldEncryptionError);
    assert.throws(() => cipher.decrypt("plain text", "mfa-totp:account-1"), FieldEncryptionError);
    // A truncated tag is refused outright, rather than checked against fewer bytes.
    const shortTag = Buffer.from(parts[4]!, "base64url").subarray(0, 4).toString("base64url");
    assert.throws(() => cipher.decrypt([...parts.slice(0, 4), shortTag].join("."), "mfa-totp:account-1"), FieldEncryptionError);
  });

  it("rotates keys: new values use the first key, older ones still decrypt and are flagged for rewriting", () => {
    const old = createFieldCipher(keys);
    const stored = old.encrypt("secret", "ctx");
    const rotated = createFieldCipher([...parseDataKeys(newDataKeyEntry("k2")), ...keys]);
    assert.equal(rotated.decrypt(stored, "ctx"), "secret");
    assert.equal(rotated.needsReencryption(stored), true);
    assert.equal(rotated.needsReencryption(rotated.encrypt("secret", "ctx")), false);
    assert.throws(() => createFieldCipher(parseDataKeys(newDataKeyEntry("k3"))).decrypt(stored, "ctx"), /no longer configured/);
  });

  it("refuses malformed key settings without echoing the key", () => {
    assert.throws(() => parseDataKeys(""), /no keys/);
    assert.throws(() => parseDataKeys("k1:c2hvcnQ="), /32 bytes/);
    assert.throws(() => parseDataKeys("no-separator"), /k1:/);
    const entry = newDataKeyEntry("k1");
    assert.throws(() => parseDataKeys(`${entry},${entry}`), /twice/);
  });
});

describe("password hashing", () => {
  it("uses at least the OWASP scrypt parameters (N = 2^17, r = 8, p = 1)", () => {
    assert.ok(scryptParameters.N >= 2 ** 17);
    assert.ok(scryptParameters.r >= 8);
    assert.equal(scryptParameters.p, 1);
  });
});
