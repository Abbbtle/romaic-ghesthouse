import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { createSetupService } from "./setup-service";
import { exhausted, memoryAccountStores, movableClock, plainPasswords, plainTokens, sequentialSecrets, unlimited, uuidIds } from "./testing/fakes";
import { accountHarness } from "./testing/harness";

const input = { name: "Nico", email: "owner@example.com", password: "a long passphrase", confirmPassword: "a long passphrase", setupToken: "" };

function setupWith(setup: { token: string | null; openWithoutToken: boolean }, limiter = unlimited) {
  const stores = memoryAccountStores();
  return {
    stores,
    service: createSetupService({ ...stores, passwords: plainPasswords, tokens: plainTokens, secrets: sequentialSecrets(), ids: uuidIds(), clock: movableClock(), audit: memoryAuditRecorder(), limiter, setup }),
  };
}

describe("first-run setup", () => {
  it("creates the first owner and a session that must still set up an authenticator", async () => {
    const h = accountHarness();
    const result = await h.setup.setUp(input, { visitorKey: "visitor", device: "Chrome on Mac" });
    assert.ok(result.ok);
    const state = await h.accounts.authenticate(result.session.token);
    assert.equal(state?.actor.role, "owner");
    assert.equal(state?.mfaEnrolmentDue, true, "the dashboard stays shut until an authenticator is set up");
    assert.ok(h.audit.events.some((event) => event.action === "team.first-owner"));
  });

  it("is done once any account exists", async () => {
    const h = accountHarness();
    await h.setup.setUp(input, { visitorKey: "visitor", device: "Chrome on Mac" });
    assert.equal(await h.setup.status(), "done");
    assert.match(JSON.stringify(await h.setup.setUp({ ...input, email: "else@example.com" }, { visitorKey: "visitor", device: "Chrome on Mac" })), /already done/);
  });

  it("needs the setup code when one is set, and stays locked in production without one", async () => {
    const withToken = setupWith({ token: "the-setup-code", openWithoutToken: false });
    assert.equal(await withToken.service.status(), "needs-token");
    assert.equal((await withToken.service.setUp(input, { visitorKey: "visitor", device: "x" })).ok, false);
    assert.equal((await withToken.service.setUp({ ...input, setupToken: "wrong" }, { visitorKey: "visitor", device: "x" })).ok, false);
    assert.equal((await withToken.service.setUp({ ...input, setupToken: "the-setup-code" }, { visitorKey: "visitor", device: "x" })).ok, true);
    const locked = setupWith({ token: null, openWithoutToken: false });
    assert.equal(await locked.service.status(), "locked");
  });

  it("limits attempts per visitor", async () => {
    const limited = setupWith({ token: "code", openWithoutToken: false }, exhausted);
    assert.match(JSON.stringify(await limited.service.setUp({ ...input, setupToken: "code" }, { visitorKey: "visitor", device: "x" })), /Too many attempts/);
  });
});
