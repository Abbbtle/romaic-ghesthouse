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
    await h.runDeferred();
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0]?.to, owner.email);
  });

  it("answers an owner's address and an unknown one without waiting on the lookup, the link, the email or the audit entry", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    const findByEmail = h.stores.accounts.findByEmail.bind(h.stores.accounts);
    let lookups = 0;
    h.stores.accounts.findByEmail = async (email) => (lookups++, findByEmail(email));
    for (const email of [owner.email, "nobody@example.com"]) {
      assert.deepEqual(await h.emailLinks.requestPasswordReset(email, { visitorKey: "visitor" }), { message: resetRequestedMessage });
    }
    assert.equal(lookups, 0, "neither reply waits on looking the address up");
    assert.equal(h.deferred.length, 2, "both replies leave the same work for after the response");
    assert.equal(h.sent.length, 0, "neither reply waits on the email");
    assert.equal(h.audit.events.length, 0, "neither reply waits on the audit entry");

    await h.runDeferred();
    assert.equal(lookups, 2);
    assert.deepEqual(h.sent.map((message) => message.to), [owner.email], "only the owner is emailed, once the reply has gone");
    const requested = h.audit.events.filter((event) => event.action === "password-reset.requested");
    assert.deepEqual(
      requested.map((event) => [event.target?.id, event.summary, event.ipHash]),
      [[owner.id, `Password reset link emailed to ${owner.name}`, "visitor"]],
    );
    const token = linkToken(h.sent[0]!.text);
    assert.ok((await h.emailLinks.resetPassword({ token, newPassword: "a fresh new passphrase", confirmPassword: "a fresh new passphrase" })).ok, "the link was issued");
  });

  it("resets once with the link, signs out everywhere, keeps the authenticator and refuses the link again", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    const session = await h.signInFully(owner);
    await h.enrol(session, owner.id);
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    await h.runDeferred();
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
    await h.runDeferred();
    h.clock.advance(30 * 60 * 1000);
    const token = linkToken(h.sent[0]!.text);
    assert.equal((await h.emailLinks.resetPassword({ token, newPassword: "a fresh new passphrase", confirmPassword: "a fresh new passphrase" })).ok, false);
  });

  it("retires an earlier link when a new one is sent", async () => {
    const h = accountHarness();
    const owner = await h.addAccount("owner", { emailVerifiedAt: new Date("2026-11-01T08:00:00.000Z") });
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    await h.runDeferred();
    await h.emailLinks.requestPasswordReset(owner.email, { visitorKey: "visitor" });
    await h.runDeferred();
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
