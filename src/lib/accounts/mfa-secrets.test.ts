import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldCipher } from "@/lib/kernel/ports";
import { mfaSecretContext, reencryptMfaSecrets, refreshMfaSecret } from "./mfa-secrets";
import { memoryAccountStores } from "./testing/fakes";

/** A cipher mid-rotation: it reads values under key 1 or key 2 and writes under key 2. */
const rotatingCipher: FieldCipher = {
  encrypt: (plaintext, context) => `k2|${context}|${plaintext}`,
  decrypt: (ciphertext, context) => {
    const [key, boundTo, plaintext] = ciphertext.split("|");
    if ((key !== "k1" && key !== "k2") || boundTo !== context || plaintext === undefined) throw new Error("Can't decrypt that.");
    return plaintext;
  },
  needsReencryption: (ciphertext) => ciphertext.startsWith("k1|"),
};

const nico = "00000000-0000-4000-8000-000000000001";
const sam = "00000000-0000-4000-8000-000000000002";
const at = new Date("2026-11-12T08:00:00.000Z");

describe("moving authenticator secrets onto a new key", () => {
  it("re-encrypts every secret still on an older key, bound to its account, and leaves the rest", async () => {
    const { mfa } = memoryAccountStores();
    await mfa.beginEnrolment(nico, { secretCiphertext: `k1|${mfaSecretContext(nico)}|JBSWY3DP`, at });
    await mfa.beginEnrolment(sam, { secretCiphertext: `k2|${mfaSecretContext(sam)}|KRSXG5CT`, at });
    assert.deepEqual(await reencryptMfaSecrets({ mfa, cipher: rotatingCipher }), { reencrypted: 1, remaining: 0 });
    assert.equal((await mfa.find(nico))?.secretCiphertext, `k2|${mfaSecretContext(nico)}|JBSWY3DP`);
    assert.equal((await mfa.find(sam))?.secretCiphertext, `k2|${mfaSecretContext(sam)}|KRSXG5CT`);
    assert.deepEqual(await reencryptMfaSecrets({ mfa, cipher: rotatingCipher }), { reencrypted: 0, remaining: 0 }, "running again finds nothing to do");
  });

  it("doesn't overwrite a secret that changed after it was read", async () => {
    const { mfa } = memoryAccountStores();
    await mfa.beginEnrolment(nico, { secretCiphertext: `k2|${mfaSecretContext(nico)}|NEWSECRET`, at });
    assert.equal(await refreshMfaSecret({ mfa, cipher: rotatingCipher }, nico, `k1|${mfaSecretContext(nico)}|OLDSECRET`, "OLDSECRET"), false);
    assert.equal((await mfa.find(nico))?.secretCiphertext, `k2|${mfaSecretContext(nico)}|NEWSECRET`);
  });
});
