import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseSecurityHeaders, dashboardPolicy, newNonce, publicPolicy } from "./content-security-policy";

const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `));

describe("the dashboard's Content Security Policy", () => {
  it("allows scripts only by nonce and strict-dynamic, never inline", () => {
    const script = directive(dashboardPolicy("abc123"), "script-src");
    assert.ok(script?.includes("'nonce-abc123'"));
    assert.ok(script?.includes("'strict-dynamic'"));
    assert.equal(script?.includes("'unsafe-inline'"), false);
  });

  it("forbids framing, plugins, base tags, other origins and posting elsewhere", () => {
    const policy = dashboardPolicy("n");
    for (const expected of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "default-src 'self'", "connect-src 'self'", "form-action 'self'"]) {
      assert.ok(policy.includes(expected), expected);
    }
    assert.equal(policy.includes("supabase.co"), false, "no wildcard origins");
  });

  it("makes a fresh, unguessable nonce for every response", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => newNonce()));
    assert.equal(nonces.size, 50);
    for (const nonce of nonces) assert.equal(Buffer.from(nonce, "base64").length, 16);
  });
});

describe("the public pages' Content Security Policy", () => {
  it("shares every strict directive with the dashboard's", () => {
    for (const expected of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "default-src 'self'"]) {
      assert.ok(publicPolicy().includes(expected), expected);
    }
  });
});

describe("security headers", () => {
  it("sends HSTS in production only, and nosniff, a referrer policy and framing denial everywhere", () => {
    const production = Object.fromEntries(baseSecurityHeaders(true).map(({ key, value }) => [key, value]));
    assert.equal(production["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
    assert.equal(production["X-Content-Type-Options"], "nosniff");
    assert.equal(production["X-Frame-Options"], "DENY");
    assert.ok(production["Referrer-Policy"]);
    assert.ok(production["Permissions-Policy"]?.includes("camera=()"));
    assert.equal(baseSecurityHeaders(false).some((header) => header.key === "Strict-Transport-Security"), false);
  });
});
