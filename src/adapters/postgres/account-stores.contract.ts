import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Account, AccountStore, AccountTokenStore, MfaStore, Session, SessionStore } from "@/lib/accounts/ports";

export type AccountStores = { accounts: AccountStore; sessions: SessionStore; mfa: MfaStore; tokens: AccountTokenStore };

export type AccountStoreContractOptions = {
  /** Whether writes can really land at the same moment (a database server). Elsewhere those tests skip. */
  concurrentTransactions: boolean;
};

const at = new Date("2026-11-12T08:00:00.000Z");
const hour = 60 * 60 * 1000;

const ids = {
  nico: "00000000-0000-4000-8000-000000000001",
  second: "00000000-0000-4000-8000-000000000002",
  sam: "00000000-0000-4000-8000-000000000003",
  thabo: "00000000-0000-4000-8000-000000000004",
  unknown: "00000000-0000-4000-8000-0000000000ff",
};

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    email: `${id.slice(-3)}@example.com`,
    name: "Someone",
    role: "owner",
    status: "active",
    passwordHash: "plain:a long passphrase",
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    emailVerifiedAt: null,
    createdAt: at,
    updatedAt: at,
    lastSignedInAt: null,
    ...overrides,
  };
}

function session(tokenHash: string, accountId: string, overrides: Partial<Session> = {}): Session {
  return {
    tokenHash,
    accountId,
    createdAt: at,
    idleExpiresAt: new Date(at.getTime() + 24 * hour),
    absoluteExpiresAt: new Date(at.getTime() + 7 * 24 * hour),
    lastExtendedAt: at,
    mfaVerifiedAt: null,
    stepUpAt: null,
    device: "Safari on iPhone",
    ...overrides,
  };
}

/**
 * The promises every implementation of the account stores keeps: Postgres
 * (on PGlite and on a real server) and the in-memory fakes the services'
 * unit tests use.
 */
export function describeAccountStoreContract(label: string, open: () => AccountStores, options: AccountStoreContractOptions): void {
  const concurrent = { skip: options.concurrentTransactions ? false : "writes don't overlap here" };

  describe(`${label}: accounts`, () => {
    it("creates the first owner only while there's no account at all", async () => {
      const { accounts } = open();
      assert.equal(await accounts.createFirstOwner(account(ids.nico)), true);
      assert.equal(await accounts.createFirstOwner(account(ids.second)), false);
      assert.equal(await accounts.anyExist(), true);
    });

    it("creates one first owner when two servers try at the same moment", concurrent, async () => {
      const { accounts } = open();
      const results = await Promise.all([accounts.createFirstOwner(account(ids.nico)), accounts.createFirstOwner(account(ids.second))]);
      assert.deepEqual(results.sort(), [false, true]);
    });

    it("finds an account by id and by its lower-case address, and refuses a taken address", async () => {
      const { accounts } = open();
      await accounts.create(account(ids.nico, { email: "Nico@Example.com" }));
      assert.equal((await accounts.findByEmail("nico@example.com"))?.id, ids.nico);
      assert.equal((await accounts.findById(ids.nico))?.status, "active");
      assert.equal(await accounts.findById("not-a-uuid"), null);
      assert.deepEqual(await accounts.create(account(ids.second, { email: "nico@example.com" })), { status: "email-taken" });
    });

    it("lists owners, admins, sales then staff, without password hashes, with whether each has an authenticator", async () => {
      const { accounts, mfa } = open();
      await accounts.create(account(ids.thabo, { role: "staff", name: "Thabo" }));
      await accounts.create(account(ids.sam, { role: "admin", name: "Sam" }));
      await accounts.create(account(ids.nico, { name: "Nico" }));
      await mfa.beginEnrolment(ids.nico, { secretCiphertext: "secret", at });
      await mfa.confirmEnrolment(ids.nico, { at, step: 1, recoveryCodeHashes: [] });
      const listed = await accounts.list();
      assert.deepEqual(
        listed.map((member) => [member.name, member.role, member.mfaEnabled]),
        [
          ["Nico", "owner", true],
          ["Sam", "admin", false],
          ["Thabo", "staff", false],
        ],
      );
      assert.equal("passwordHash" in listed[0]!, false);
    });

    it("never leaves the team without an active owner, and signs out someone whose role changes", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await accounts.create(account(ids.second, { status: "disabled" }));
      assert.equal(await accounts.changeRole(ids.nico, { from: "owner", to: "admin", at }), "last-owner", "the disabled owner doesn't count");
      assert.equal(await accounts.setStatus(ids.nico, { status: "disabled", role: "owner", at }), "last-owner");
      assert.equal(await accounts.remove(ids.nico, { role: "owner" }), "last-owner");
      assert.equal(await accounts.setStatus(ids.second, { status: "active", role: "owner", at }), "changed", "turning an owner back on is never the last-owner case");
      await accounts.create(account(ids.sam, { role: "admin" }));
      await sessions.create(session("hash-sam", ids.sam));
      assert.equal(await accounts.changeRole(ids.sam, { from: "admin", to: "staff", at }), "changed");
      assert.equal(await sessions.findWithAccount("hash-sam"), null);
      assert.equal(await accounts.changeRole(ids.sam, { from: "admin", to: "sales", at }), "stale", "only while the role is still the one expected");
      assert.equal(await accounts.remove(ids.thabo, { role: "staff" }), "stale", "nobody there");
      assert.equal(await accounts.setStatus("not-a-uuid", { status: "disabled", role: "staff", at }), "stale");
    });

    it("turns someone off and back on, signing them out when turned off", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await accounts.create(account(ids.thabo, { role: "staff" }));
      await sessions.create(session("hash-thabo", ids.thabo));
      assert.equal(await accounts.setStatus(ids.thabo, { status: "disabled", role: "staff", at }), "changed");
      assert.equal(await sessions.findWithAccount("hash-thabo"), null);
      assert.equal((await accounts.findById(ids.thabo))?.status, "disabled");
      assert.equal(await accounts.setStatus(ids.thabo, { status: "active", role: "staff", at }), "changed");
    });

    it("sets a password, temporary with its expiry or not, signing out every session but the one kept", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await sessions.create(session("hash-a", ids.nico));
      await sessions.create(session("hash-b", ids.nico));
      const expiresAt = new Date(at.getTime() + 72 * hour);
      assert.equal(await accounts.setPassword(ids.nico, { passwordHash: "plain:temp", temporary: { expiresAt }, at, keepSessionHash: "hash-a" }), true);
      const stored = await accounts.findById(ids.nico);
      assert.equal(stored?.mustChangePassword, true);
      assert.equal(stored?.temporaryPasswordExpiresAt?.getTime(), expiresAt.getTime());
      assert.ok(await sessions.findWithAccount("hash-a"));
      assert.equal(await sessions.findWithAccount("hash-b"), null);
      await accounts.setPassword(ids.nico, { passwordHash: "plain:own", temporary: null, at, keepSessionHash: null });
      assert.equal((await accounts.findById(ids.nico))?.temporaryPasswordExpiresAt, null);
    });

    it("verifies an address only while it's still the account's", async () => {
      const { accounts } = open();
      await accounts.create(account(ids.nico, { email: "nico@example.com" }));
      assert.equal(await accounts.markEmailVerified(ids.nico, { email: "old@example.com", at }), false);
      assert.equal(await accounts.markEmailVerified(ids.nico, { email: "nico@example.com", at }), true);
      assert.equal((await accounts.findById(ids.nico))?.emailVerifiedAt?.getTime(), at.getTime());
    });
  });

  describe(`${label}: sessions`, () => {
    it("finds a session with its account, extends its idle limit once and never past the absolute limit", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await sessions.create(session("hash", ids.nico, { absoluteExpiresAt: new Date(at.getTime() + 25 * hour) }));
      const later = new Date(at.getTime() + 3 * hour);
      const change = { idleExpiresAt: new Date(later.getTime() + 24 * hour), at: later, unlessExtendedSince: new Date(later.getTime() - hour) };
      const results = await Promise.all([sessions.extend("hash", change), sessions.extend("hash", change)]);
      assert.deepEqual(results.sort(), [false, true]);
      const found = await sessions.findWithAccount("hash");
      assert.equal(found?.session.idleExpiresAt.getTime(), at.getTime() + 25 * hour, "capped at the absolute limit");
      assert.equal(found?.mfaEnabled, false);
    });

    it("records step-up, lists live sessions newest first, and signs out everywhere but one", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await sessions.create(session("old", ids.nico));
      await sessions.create(session("new", ids.nico, { createdAt: new Date(at.getTime() + 1000) }));
      await sessions.create(session("gone", ids.nico, { idleExpiresAt: new Date(at.getTime() + 1) }));
      assert.equal(await sessions.markSteppedUp("new", at), true);
      assert.equal((await sessions.findWithAccount("new"))?.session.stepUpAt?.getTime(), at.getTime());
      const listed = await sessions.listForAccount(ids.nico, new Date(at.getTime() + 10));
      assert.deepEqual(
        listed.map((entry) => entry.tokenHash),
        ["new", "old"],
      );
      assert.equal(await sessions.deleteForAccount(ids.nico, "new"), 2);
      assert.ok(await sessions.findWithAccount("new"));
    });

    it("forgets sessions past either limit", async () => {
      const { accounts, sessions } = open();
      await accounts.create(account(ids.nico));
      await sessions.create(session("idle", ids.nico, { idleExpiresAt: new Date(at.getTime() + hour) }));
      await sessions.create(session("absolute", ids.nico, { absoluteExpiresAt: new Date(at.getTime() + 2 * hour) }));
      await sessions.create(session("live", ids.nico));
      assert.equal(await sessions.deleteExpired(new Date(at.getTime() + 2 * hour)), 2);
      assert.ok(await sessions.findWithAccount("live"));
    });
  });

  describe(`${label}: authenticators`, () => {
    it("enrols, confirms once, refuses re-enrolment while confirmed, and accepts each step once", async () => {
      const { accounts, mfa } = open();
      await accounts.create(account(ids.nico));
      assert.equal(await mfa.beginEnrolment(ids.nico, { secretCiphertext: "first", at }), true);
      assert.equal(await mfa.beginEnrolment(ids.nico, { secretCiphertext: "second", at }), true, "a pending one can restart");
      assert.equal((await mfa.find(ids.nico))?.secretCiphertext, "second");
      assert.equal(await mfa.confirmEnrolment(ids.nico, { at, step: 100, recoveryCodeHashes: ["r1", "r2"] }), true);
      assert.equal(await mfa.confirmEnrolment(ids.nico, { at, step: 101, recoveryCodeHashes: [] }), false);
      assert.equal(await mfa.beginEnrolment(ids.nico, { secretCiphertext: "third", at }), false);
      assert.equal(await mfa.recordUse(ids.nico, 100), false, "the enrolment step can't be reused");
      assert.equal(await mfa.recordUse(ids.nico, 101), true);
      assert.equal(await mfa.recordUse(ids.nico, 101), false);
    });

    it("uses each recovery code once, replaces them, and removes everything on reset", async () => {
      const { accounts, mfa } = open();
      await accounts.create(account(ids.nico));
      await mfa.beginEnrolment(ids.nico, { secretCiphertext: "s", at });
      await mfa.confirmEnrolment(ids.nico, { at, step: 1, recoveryCodeHashes: ["r1", "r2"] });
      assert.equal(await mfa.useRecoveryCode(ids.nico, "r1", at), true);
      assert.equal(await mfa.useRecoveryCode(ids.nico, "r1", at), false);
      assert.equal(await mfa.countUnusedRecoveryCodes(ids.nico), 1);
      await mfa.replaceRecoveryCodes(ids.nico, ["n1", "n2", "n3"], at);
      assert.equal(await mfa.useRecoveryCode(ids.nico, "r2", at), false);
      assert.equal(await mfa.countUnusedRecoveryCodes(ids.nico), 3);
      await mfa.remove(ids.nico);
      assert.equal(await mfa.find(ids.nico), null);
      assert.equal(await mfa.countUnusedRecoveryCodes(ids.nico), 0);
    });

    it("lists every secret and swaps one for a re-encrypted copy only while it's unchanged", async () => {
      const { accounts, mfa } = open();
      await accounts.create(account(ids.nico));
      await mfa.beginEnrolment(ids.nico, { secretCiphertext: "old-key", at });
      assert.deepEqual(await mfa.listSecretCiphertexts(), [{ accountId: ids.nico, secretCiphertext: "old-key" }]);
      assert.equal(await mfa.replaceSecretCiphertext(ids.nico, { previous: "something else", next: "new-key" }), false, "a reset or new enrolment meanwhile wins");
      assert.equal(await mfa.replaceSecretCiphertext(ids.nico, { previous: "old-key", next: "new-key" }), true);
      assert.equal((await mfa.find(ids.nico))?.secretCiphertext, "new-key");
      assert.equal(await mfa.replaceSecretCiphertext("not-a-uuid", { previous: "new-key", next: "x" }), false);
    });
  });

  describe(`${label}: email links`, () => {
    const token = (tokenHash: string, purpose: "password-reset" | "email-verification" = "password-reset") => ({
      tokenHash,
      accountId: ids.nico,
      purpose,
      email: "nico@example.com",
      createdAt: at,
      expiresAt: new Date(at.getTime() + 30 * 60 * 1000),
    });

    it("uses a link once, for its purpose, before it expires", async () => {
      const { accounts, tokens } = open();
      await accounts.create(account(ids.nico, { email: "nico@example.com" }));
      await tokens.issue(token("t1"));
      assert.equal(await tokens.consume("t1", "email-verification", at), null, "wrong purpose");
      assert.deepEqual(await tokens.consume("t1", "password-reset", at), { accountId: ids.nico, email: "nico@example.com" });
      assert.equal(await tokens.consume("t1", "password-reset", at), null, "once");
      await tokens.issue(token("t2"));
      assert.equal(await tokens.consume("t2", "password-reset", new Date(at.getTime() + 30 * 60 * 1000)), null, "expired");
    });

    it("retires earlier links of the same purpose, and a new password retires reset links", async () => {
      const { accounts, tokens } = open();
      await accounts.create(account(ids.nico, { email: "nico@example.com" }));
      await tokens.issue(token("first"));
      await tokens.issue(token("verify", "email-verification"));
      await tokens.issue(token("second"));
      assert.equal(await tokens.consume("first", "password-reset", at), null);
      await accounts.setPassword(ids.nico, { passwordHash: "plain:x", temporary: null, at, keepSessionHash: null });
      assert.equal(await tokens.consume("second", "password-reset", at), null);
      assert.ok(await tokens.consume("verify", "email-verification", at), "other purposes are untouched");
    });

    it("forgets expired links", async () => {
      const { accounts, tokens } = open();
      await accounts.create(account(ids.nico, { email: "nico@example.com" }));
      await tokens.issue(token("t1"));
      assert.equal(await tokens.deleteExpired(new Date(at.getTime() + 31 * 60 * 1000)), 1);
    });
  });
}
