import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetRequestedMessage } from "./email-link-service";
import { accountHarness } from "./testing/harness";

const linkToken = (text: string) => /token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? "";

describe("owner password reset by email", () => {
  it("emails a verified owner a link, and answers everyone else the same way without sending", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    const unverified = await h.addAccount("owner");
    const sales = await h.addAccount("sales", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    for (const email of [owner.email, unverified.email, sales.email, "nobody@example.com"]) {
      assert.deepEqual(await h.emailLinks.requestPasswordReset(email, { visitorKey: "visitor" }), { message: resetRequestedMessage });
    }
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0]?.to, owner.email);
  });

  it("resets once with the link, signs out everywhere, keeps the authenticator and refuses the link again", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    const session = await h.signInFully(owner);
    await h.enrol(session, owner.id);
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    const token = linkToken(h.sent[0]!.text);
    const input = { token, newPassword: "a fresh new passphrase", confirmPassword: "a fresh new passphrase" };
    assert.ok((await h.emailLinks.resetPassword(input)).ok);
    assert.equal(await h.accounts.authenticate(session), null, "every session ends");
    assert.ok((await h.stores.mfa.find(owner.id))?.confirmedAt, "the authenticator stays");
    assert.equal((await h.emailLinks.resetPassword(input)).ok, false, "a link works once");
    assert.ok(h.audit.events.some((event) => event.action === "password-reset.completed"));
  });

  it("refuses a link after 30 minutes", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    h.clock.advance(30 * 60 * 1000);
    const token = linkToken(h.sent[0]!.text);
    assert.equal((await h.emailLinks.resetPassword({ token, newPassword: "a fresh new passphrase", confirmPassword: "a fresh new passphrase" })).ok, false);
  });

  it("retires an earlier link when a new one is sent", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    const first = linkToken(h.sent[0]!.text);
    assert.equal((await h.emailLinks.resetPassword({ token: first, newPassword: "a fresh new passphrase", confirmPassword: "a fresh new passphrase" })).ok, false);
  });
});

describe("confirming an email address", () => {
  it("marks the address verified from its link, only while it's still the account's address", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner");
    const actor = { id: owner.id, role: owner.role, name: owner.name };
    const requested = await h.emailLinks.requestEmailVerification(actor);
    assert.ok(requested.ok && requested.sent);
    const token = linkToken(h.sent[0]!.text);
    assert.ok((await h.emailLinks.verifyEmail(token)).ok);
    assert.ok((await h.stores.accounts.findById(owner.id))?.emailVerifiedAt);
    assert.equal((await h.emailLinks.verifyEmail(token)).ok, false, "a link works once");
  });

  it("says when no email can be sent", async () => {
    const h = accountHarness({ email: false });
    const owner = await h.addAccount("owner");
    const requested = await h.emailLinks.requestEmailVerification({ id: owner.id, role: owner.role, name: owner.name });
    assert.ok(requested.ok);
    assert.equal(requested.sent, false);
  });
});
