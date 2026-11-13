import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDevice, isSessionToken, sessionEnded, sessionHandle, sessionPolicies, sessionRenewal } from "./sessions";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

describe("session policies (roles.md, R6)", () => {
  it("gives each role its idle and absolute limits", () => {
    assert.deepEqual(sessionPolicies.owner, { idleMs: 24 * hour, absoluteMs: 7 * day });
    assert.deepEqual(sessionPolicies.sales, { idleMs: 24 * hour, absoluteMs: 7 * day });
    assert.deepEqual(sessionPolicies.staff, { idleMs: 12 * hour, absoluteMs: 7 * day });
    assert.deepEqual(sessionPolicies.admin, { idleMs: 2 * hour, absoluteMs: 24 * hour });
  });
});

describe("sessionEnded", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  it("ends a session at its idle limit or its absolute limit, whichever comes first", () => {
    const future = new Date(now.getTime() + hour);
    const past = new Date(now.getTime() - 1);
    assert.equal(sessionEnded({ idleExpiresAt: future, absoluteExpiresAt: future }, now), false);
    assert.equal(sessionEnded({ idleExpiresAt: past, absoluteExpiresAt: future }, now), true);
    assert.equal(sessionEnded({ idleExpiresAt: future, absoluteExpiresAt: past }, now), true);
    assert.equal(sessionEnded({ idleExpiresAt: now, absoluteExpiresAt: future }, now), true, "the limit itself is the end");
  });
});

describe("sessionRenewal", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  it("moves the idle limit on, spaced to a tenth of it, never past the absolute limit", () => {
    const absolute = new Date(now.getTime() + 30 * 60 * 1000);
    assert.equal(sessionRenewal({ lastExtendedAt: new Date(now.getTime() - 5 * 60 * 1000), absoluteExpiresAt: absolute }, "admin", now), null, "admin's spacing is 12 minutes");
    const due = sessionRenewal({ lastExtendedAt: new Date(now.getTime() - 13 * 60 * 1000), absoluteExpiresAt: absolute }, "admin", now);
    assert.ok(due);
    assert.equal(due.idleExpiresAt.getTime(), absolute.getTime(), "capped at the absolute limit");
  });

  it("gives a full idle period when the absolute limit is far away", () => {
    const due = sessionRenewal({ lastExtendedAt: new Date(now.getTime() - 3 * hour), absoluteExpiresAt: new Date(now.getTime() + 5 * day) }, "owner", now);
    assert.equal(due?.idleExpiresAt.getTime(), now.getTime() + 24 * hour);
  });
});

describe("tokens and handles", () => {
  it("accepts only token-shaped cookie values", () => {
    assert.equal(isSessionToken("a".repeat(43)), true);
    assert.equal(isSessionToken("a".repeat(42)), false);
    assert.equal(isSessionToken(`${"a".repeat(42)}!`), false);
  });

  it("shows a short handle that can't be used to sign in", () => {
    assert.equal(sessionHandle("0123456789abcdef0123456789abcdef"), "0123456789abcdef");
  });
});

describe("describeDevice", () => {
  it("names the browser and system plainly", () => {
    assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
    assert.equal(describeDevice("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36"), "Chrome on Android");
    assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0"), "Edge on Windows");
    assert.equal(describeDevice(null), "A browser");
  });
});
