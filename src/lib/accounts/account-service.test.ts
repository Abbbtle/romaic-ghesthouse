import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldCipher } from "@/lib/kernel/ports";
import { countingLimiter, keyedRecoveryCodes, plainCipher, plainTokens } from "./testing/fakes";
import { accountHarness } from "./testing/harness";

const device = "Safari on iPhone";

describe("signing in", () => {
  it("sends a role that needs an authenticator, without one, to set one up", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const result = await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device });
    assert.ok(result.ok);
    assert.equal(result.next, "mfa-setup");
    const state = await h.accounts.authenticate(result.session.token);
    assert.equal(state?.mfaEnrolmentDue, true);
    assert.equal(state?.mfaDue, false);
  });

  it("lets staff without an authenticator straight in", async () => {
    const h = accountHarness();
    const staff = await h.addAccount("staff");
    const result = await h.accounts.signIn({ email: staff.email, password: "a long passphrase" }, { visitorKey: "visitor", device });
    assert.ok(result.ok);
    assert.equal(result.next, "dashboard");
  });

  it("asks for the code when an authenticator is set up, then a temporary password's replacement", async () => {
    const h = accountHarness();
    const sales = await h.addAccount("sales");
    const first = await h.signInFully(sales);
    await h.enrol(first, sales.id);
    await h.stores.accounts.setPassword(sales.id, { passwordHash: "plain:temporary-one", temporary: { expiresAt: new Date(h.clock.now().getTime() + 3600_000) }, at: h.clock.now(), keepSessionHash: null });
    const result = await h.accounts.signIn({ email: sales.email, password: "temporary-one" }, { visitorKey: "visitor", device });
    assert.ok(result.ok);
    assert.equal(result.next, "mfa", "a password reset never skips the authenticator");
  });

  it("refuses wrong passwords and unknown addresses with the same words, and records the attempt", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const wrong = await h.accounts.signIn({ email: owner.email, password: "not it at all" }, { visitorKey: "visitor", device });
    const unknown = await h.accounts.signIn({ email: "nobody@example.com", password: "not it at all" }, { visitorKey: "visitor", device });
    assert.deepEqual(wrong, unknown);
    assert.equal(h.audit.events.filter((event) => event.action === "sign-in.failed").length, 2);
  });

  it("refuses a turned-off account and an expired temporary password", async () => {
    const h = accountHarness();
    const off = await h.addAccount("staff", { status: "disabled" });
    const expired = await h.addAccount("staff", { mustChangePassword: true, temporaryPasswordExpiresAt: new Date("2026-11-11T08:00:00.000Z") });
    const offResult = await h.accounts.signIn({ email: off.email, password: "a long passphrase" }, { visitorKey: "visitor", device });
    const expiredResult = await h.accounts.signIn({ email: expired.email, password: "a long passphrase" }, { visitorKey: "visitor", device });
    assert.match(JSON.stringify(offResult), /turned off/);
    assert.match(JSON.stringify(expiredResult), /expired/);
  });

  it("stops after too many attempts per address or visitor", async () => {
    const limiter = countingLimiter(2);
    const h = accountHarness({ signInLimiter: limiter });
    const owner = await h.addAccount("owner");
    for (let attempt = 0; attempt < 2; attempt++) await h.accounts.signIn({ email: owner.email, password: "wrong wrong wrong" }, { visitorKey: "visitor", device });
    const third = await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device });
    assert.match(JSON.stringify(third), /Too many attempts/);
  });

  it("gives a turned-off account's live sessions nothing", async () => {
    const h = accountHarness();
    const staff = await h.addAccount("staff");
    const token = await h.signInFully(staff);
    await h.stores.accounts.setStatus(staff.id, { status: "disabled", role: "staff", at: h.clock.now() });
    assert.equal(await h.accounts.authenticate(token), null);
  });
});

describe("authenticators", () => {
  it("confirms with the first code, hands back ten recovery codes once, and replaces the session", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const first = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    const { token, recoveryCodes } = await h.enrol(first.session.token, owner.id);
    assert.equal(recoveryCodes.length, 10);
    assert.notEqual(token, first.session.token, "a new token once the last step passes");
    assert.equal(await h.accounts.authenticate(first.session.token), null, "the old token no longer works");
    const state = await h.accounts.authenticate(token);
    assert.equal(state?.mfaEnabled, true);
    assert.equal(state?.mfaDue, false);
    assert.equal(state?.mfaEnrolmentDue, false);
    assert.ok(h.audit.events.some((event) => event.action === "mfa.enabled"));
  });

  it("keeps the secret encrypted, bound to the account", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const first = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    const started = await h.accounts.beginMfaEnrolment(first.session.token);
    assert.ok(started.ok);
    const stored = await h.stores.mfa.find(owner.id);
    assert.equal(stored?.secretCiphertext, `enc(mfa-totp:${owner.id}):${started.secret}`);
  });

  it("refuses a code used once already", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const token = await h.signInFully(owner);
    const { secret } = await h.enrol(token, owner.id);
    const code = h.totp.codeAt(secret, h.clock.now());
    const signIn = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    const reused = await h.accounts.verifyMfa(signIn.session.token, code, { device });
    assert.equal(reused.ok, false, "the enrolment code can't sign in again");
  });

  it("moves a secret encrypted under a retiring key onto the newest one when its code is accepted", async () => {
    // Values written before the rotation carry an "old-key:" mark; plainCipher writes everything new.
    const cipher: FieldCipher = {
      encrypt: plainCipher.encrypt,
      decrypt: (ciphertext, context) => plainCipher.decrypt(ciphertext.replace(/^old-key:/, ""), context),
      needsReencryption: (ciphertext) => ciphertext.startsWith("old-key:"),
    };
    const h = accountHarness({ cipher });
    const owner = await h.addAccount("owner");
    const token = await h.signInFully(owner);
    const { secret } = await h.enrol(token, owner.id);
    const current = (await h.stores.mfa.find(owner.id))!.secretCiphertext;
    await h.stores.mfa.replaceSecretCiphertext(owner.id, { previous: current, next: `old-key:${current}` });
    const signIn = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    h.clock.advance(30_000);
    assert.equal((await h.accounts.verifyMfa(signIn.session.token, h.totp.codeAt(secret, h.clock.now()), { device })).ok, true);
    assert.equal((await h.stores.mfa.find(owner.id))?.secretCiphertext, current);
  });

  it("accepts each recovery code once", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const token = await h.signInFully(owner);
    const { recoveryCodes } = await h.enrol(token, owner.id);
    const code = recoveryCodes[0]!;
    const one = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    const used = await h.accounts.verifyMfa(one.session.token, code.toUpperCase(), { device });
    assert.ok(used.ok);
    assert.equal(used.usedRecoveryCode, true);
    const two = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    assert.equal((await h.accounts.verifyMfa(two.session.token, code, { device })).ok, false);
    assert.equal(await h.accounts.recoveryCodesLeft({ id: owner.id, role: "owner", name: owner.name }), 9);
  });

  it("stores recovery codes under the keyed recovery-code hash for the account, not the token hash", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const { recoveryCodes } = await h.enrol(await h.signInFully(owner), owner.id);
    const normalized = recoveryCodes[0]!.replace("-", "");
    assert.equal(await h.stores.mfa.useRecoveryCode(owner.id, plainTokens.hash(normalized), h.clock.now()), false);
    assert.equal(await h.stores.mfa.useRecoveryCode(owner.id, h.recoveryCodes.hash(owner.id, normalized), h.clock.now()), true);
  });

  it("makes new recovery codes that work for signing in and step-up, and stops the old ones", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const actor = { id: owner.id, role: owner.role, name: owner.name };
    const { token, recoveryCodes: old } = await h.enrol(await h.signInFully(owner), owner.id);
    const made = await h.accounts.regenerateRecoveryCodes(actor);
    assert.ok(made.ok);
    assert.equal(made.recoveryCodes.length, 10);
    const signIn = async (code: string) => {
      const started = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
      return h.accounts.verifyMfa(started.session.token, code, { device });
    };
    assert.equal((await signIn(old[0]!)).ok, false);
    assert.equal((await signIn(made.recoveryCodes[0]!)).ok, true);
    assert.equal((await h.accounts.stepUp(token, { password: "a long passphrase", code: made.recoveryCodes[1]! })).ok, true);
    assert.equal(await h.accounts.recoveryCodesLeft(actor), 8);
  });

  it("still accepts a recovery code made under a data key that's no longer the newest", async () => {
    const h = accountHarness({ recoveryCodes: keyedRecoveryCodes(["k2", "k1"]) });
    const owner = await h.addAccount("owner");
    await h.enrol(await h.signInFully(owner), owner.id);
    await h.stores.mfa.replaceRecoveryCodes(owner.id, [keyedRecoveryCodes(["k1"]).hash(owner.id, "older00001")], h.clock.now());
    const started = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    const used = await h.accounts.verifyMfa(started.session.token, "older-00001", { device });
    assert.ok(used.ok);
    assert.equal(used.usedRecoveryCode, true);
  });

  it("limits code attempts per account", async () => {
    const h = accountHarness({ mfaLimiter: countingLimiter(1) });
    const owner = await h.addAccount("owner");
    const token = await h.signInFully(owner);
    await h.enrol(token, owner.id);
    const signIn = (await h.accounts.signIn({ email: owner.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    await h.accounts.verifyMfa(signIn.session.token, "000000", { device });
    const second = await h.accounts.verifyMfa(signIn.session.token, "000000", { device });
    assert.match(JSON.stringify(second), /Too many attempts/);
  });

  it("can't be turned off by roles that need one, but can by staff", async () => {
    const h = accountHarness();
    const sales = await h.addAccount("sales");
    const staff = await h.addAccount("staff");
    assert.equal((await h.accounts.disableMfa({ id: sales.id, role: "sales", name: sales.name })).ok, false);
    assert.equal((await h.accounts.disableMfa({ id: staff.id, role: "staff", name: staff.name })).ok, true);
  });
});

describe("step-up", () => {
  it("records a re-entered password and code in this session only", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const token = await h.signInFully(owner);
    const { token: verified, secret } = await h.enrol(token, owner.id);
    h.clock.advance(60_000);
    const wrong = await h.accounts.stepUp(verified, { password: "a long passphrase", code: "000000" });
    assert.equal(wrong.ok, false);
    h.clock.advance(30_000);
    const right = await h.accounts.stepUp(verified, { password: "a long passphrase", code: h.totp.codeAt(secret, h.clock.now()) });
    assert.ok(right.ok);
    assert.ok((await h.accounts.authenticate(verified))?.stepUpAt);
  });
});

describe("sessions", () => {
  it("lists the person's sessions, marks this one, and ends another", async () => {
    const h = accountHarness();
    const staff = await h.addAccount("staff");
    const here = await h.signInFully(staff);
    h.clock.advance(1000);
    const there = await h.signInFully(staff);
    const actor = { id: staff.id, role: "staff" as const, name: staff.name };
    const listed = await h.accounts.listSessions(actor, here);
    assert.equal(listed.length, 2);
    assert.equal(listed.filter((session) => session.current).length, 1);
    const other = listed.find((session) => !session.current)!;
    assert.ok((await h.accounts.endSession(actor, other.handle)).ok);
    assert.equal(await h.accounts.authenticate(there), null);
    assert.ok(await h.accounts.authenticate(here));
  });

  it("ends a session at its absolute limit however much it's used", async () => {
    const h = accountHarness();
    const admin = await h.addAccount("admin", {});
    const token = (await h.accounts.signIn({ email: admin.email, password: "a long passphrase" }, { visitorKey: "visitor", device })) as { ok: true; session: { token: string } };
    for (let step = 0; step < 24; step++) {
      h.clock.advance(60 * 60 * 1000);
      await h.accounts.authenticate(token.session.token);
    }
    assert.equal(await h.accounts.authenticate(token.session.token), null, "an admin session lasts 24 hours at most");
  });

  it("changes a password, keeping this browser and signing out the rest", async () => {
    const h = accountHarness();
    const staff = await h.addAccount("staff");
    const here = await h.signInFully(staff);
    const there = await h.signInFully(staff);
    const actor = { id: staff.id, role: "staff" as const, name: staff.name };
    const result = await h.accounts.changePassword(actor, here, { currentPassword: "a long passphrase", newPassword: "a brand new passphrase", confirmPassword: "a brand new passphrase" });
    assert.ok(result.ok);
    assert.ok(await h.accounts.authenticate(here));
    assert.equal(await h.accounts.authenticate(there), null);
  });
});
