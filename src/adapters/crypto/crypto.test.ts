import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { isSessionToken } from "@/lib/accounts/sessions";
import { passwordProblem } from "@/lib/accounts/input";
import { accountHarness } from "@/lib/accounts/testing/harness";
import { newDataKeyEntry, parseDataKeys } from "./field-encryption";
import { createRecoveryCodeHasher, createTokenSigner, createVisitorKeys } from "./hmac";
import { scryptPasswordHasher } from "./passwords";
import { randomIds, randomSecrets, sha256Hex, sha256TokenHasher } from "./tokens";

describe("scryptPasswordHasher", () => {
  it("verifies the right password only, with a fresh salt each time", async () => {
    const hash = await scryptPasswordHasher.hash("correct horse battery");
    assert.match(hash, /^scrypt\$131072\$8\$1\$[\w-]{22}\$[\w-]{86}$/);
    assert.equal(await scryptPasswordHasher.verify("correct horse battery", hash), true);
    assert.equal(await scryptPasswordHasher.verify("correct horse batterY", hash), false);
    assert.notEqual(hash, await scryptPasswordHasher.hash("correct horse battery"));
  });

  it("treats a password typed with composed or decomposed accents as the same", async () => {
    const hash = await scryptPasswordHasher.hash("café au lait");
    assert.equal(await scryptPasswordHasher.verify("café au lait", hash), true);
  });

  it("never matches a malformed stored hash", async () => {
    assert.equal(await scryptPasswordHasher.verify("anything", "scrypt$x$y$z$bad$bad"), false);
    assert.equal(await scryptPasswordHasher.verify("anything", "bcrypt$whatever"), false);
    assert.equal(await scryptPasswordHasher.verify("anything", ""), false);
  });
});

describe("tokens and secrets", () => {
  it("makes session tokens the session rules accept, each different", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => randomSecrets.sessionToken()));
    assert.equal(tokens.size, 20);
    assert.ok([...tokens].every(isSessionToken));
  });

  it("makes temporary passwords that are easy to read out and pass the password rules", () => {
    const password = randomSecrets.temporaryPassword();
    assert.match(password, /^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
    assert.equal(passwordProblem(password, "sam@example.com"), null);
    assert.notEqual(password, randomSecrets.temporaryPassword());
  });

  it("hashes tokens with SHA-256 and compares them in constant time", () => {
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(sha256TokenHasher.hash("abc"), sha256Hex("abc"));
    assert.equal(sha256TokenHasher.matches("abc", sha256Hex("abc")), true);
    assert.equal(sha256TokenHasher.matches("abd", sha256Hex("abc")), false);
    assert.equal(sha256TokenHasher.matches("abc", "not a hash"), false);
  });

  it("makes random UUIDs for record ids", () => {
    assert.match(randomIds.newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("visitor keys", () => {
  it("gives each address a stable 32-character key that doesn't contain it", () => {
    const keys = createVisitorKeys("a shared secret");
    const key = keys.keyFor("196.21.0.1");
    assert.match(key, /^[\w-]{32}$/);
    assert.equal(keys.keyFor("196.21.0.1"), key);
    assert.notEqual(keys.keyFor("196.21.0.2"), key);
    assert.notEqual(createVisitorKeys("another secret").keyFor("196.21.0.1"), key, "servers must share the secret to share limits");
    assert.equal(keys.keyFor(null), keys.keyFor("unknown"));
  });
});

describe("signed tokens", () => {
  it("hands back the payload of a token it signed, and nothing for anything else", () => {
    const forms = createTokenSigner("a shared secret", "booking-form");
    const token = forms.sign("1760947200000");
    assert.equal(forms.verify(token), "1760947200000");
    const [payload, signature] = token.split(".");
    assert.equal(forms.verify(`${Buffer.from("1").toString("base64url")}.${signature}`), null, "a changed payload");
    assert.equal(forms.verify(`${payload}.${"A".repeat(43)}`), null, "a forged signature");
    assert.equal(forms.verify(`${token}.extra`), null);
    assert.equal(forms.verify(""), null);
    assert.equal(createTokenSigner("a shared secret", "something-else").verify(token), null, "a token for one purpose fails for another");
    assert.equal(createTokenSigner("another secret", "booking-form").verify(token), null);
  });

  it("carries any text, dots included", () => {
    const signer = createTokenSigner("a shared secret", "test");
    assert.equal(signer.verify(signer.sign("a.b.c ünïcode")), "a.b.c ünïcode");
  });
});

describe("recovery code hashes", () => {
  const accountId = "00000000-0000-4000-8000-000000000901";
  const code = "kd7m3xqpv9";

  it("are HMACs under a key the database never holds, tied to the account, never the code's SHA-256", () => {
    const hasher = createRecoveryCodeHasher([{ id: "k1", key: randomBytes(32) }]);
    const hash = hasher.hash(accountId, code);
    assert.match(hash, /^hmac-sha256\.k1\.[\w-]{43}$/);
    assert.equal(hasher.hash(accountId, code), hash, "the same code hashes the same, so a typed code can be found");
    assert.ok(!hash.includes(sha256Hex(code)), "not the plain SHA-256 a leaked table could be searched for");
    assert.ok(!hasher.candidateHashes(accountId, code).includes(sha256Hex(code)), "a code stored as its plain SHA-256 never matches");
    assert.notEqual(hasher.hash("00000000-0000-4000-8000-000000000902", code), hash, "the same code on another account hashes differently");
    assert.notEqual(createRecoveryCodeHasher([{ id: "k1", key: randomBytes(32) }]).hash(accountId, code), hash, "without the key, the hash can't be made");
  });

  it("keeps matching codes made under an older data key once a new one is put in front", () => {
    const [k2, k1] = parseDataKeys(`${newDataKeyEntry("k2")},${newDataKeyEntry("k1")}`);
    const before = createRecoveryCodeHasher([k1!]);
    const after = createRecoveryCodeHasher([k2!, k1!]);
    assert.match(after.hash(accountId, code), /^hmac-sha256\.k2\./, "new codes use the newest key");
    assert.deepEqual(after.candidateHashes(accountId, code), [after.hash(accountId, code), before.hash(accountId, code)]);
    assert.throws(() => createRecoveryCodeHasher([]));
  });

  it("works for enrolment, new codes and signing in, storing none as its SHA-256", async () => {
    const h = accountHarness({ recoveryCodes: createRecoveryCodeHasher(parseDataKeys(newDataKeyEntry("k1"))) });
    const owner = await h.addAccount("owner");
    const actor = { id: owner.id, role: owner.role, name: owner.name };
    const storedAsSha256 = async (codes: string[]) => {
      for (const recovery of codes) {
        if (await h.stores.mfa.useRecoveryCode(owner.id, sha256Hex(recovery.replace("-", "")), h.clock.now())) return true;
      }
      return false;
    };
    const { recoveryCodes: first } = await h.enrol(await h.signInFully(owner), owner.id);
    assert.equal(await storedAsSha256(first), false);
    const made = await h.accounts.regenerateRecoveryCodes(actor);
    assert.ok(made.ok);
    assert.equal(await storedAsSha256(made.recoveryCodes), false);
    const signIn = async (recovery: string) => {
      const started = await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device: "Safari on iPhone" });
      assert.ok(started.ok);
      return h.accounts.verifyMfa(started.session.token, recovery, { device: "Safari on iPhone" });
    };
    assert.equal((await signIn(first[0]!)).ok, false, "the first codes stopped working when new ones were made");
    assert.equal((await signIn(made.recoveryCodes[0]!)).ok, true);
    assert.equal(await h.accounts.recoveryCodesLeft(actor), 9);
  });
});
