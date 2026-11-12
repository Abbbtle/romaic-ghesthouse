import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearedSessionCookieOptions, sessionCookieName, sessionCookieOptions } from "./session-cookie";

describe("the session cookie", () => {
  it("is a __Host- cookie in production, so no subdomain can set or replace it", () => {
    assert.equal(sessionCookieName(true), "__Host-romaic_session");
    assert.equal(sessionCookieName(false), "romaic_session", "plain http://localhost can't hold a __Host- cookie");
  });

  it("is out of scripts' reach, kept from cross-site posts, HTTPS-only in production, Path=/, and ends with the session", () => {
    const expiresAt = new Date("2026-11-19T08:00:00.000Z");
    assert.deepEqual(sessionCookieOptions(expiresAt, true), { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt });
    assert.equal(sessionCookieOptions(expiresAt, false).secure, false);
    assert.equal(clearedSessionCookieOptions(true).maxAge, 0);
  });
});
