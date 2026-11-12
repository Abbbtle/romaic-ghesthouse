import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { requestedPathHeader } from "./server/admin-paths";
import { sessionCookieName } from "./server/session-cookie";

const session = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde";
const cookieName = sessionCookieName();

const get = (path: string, cookie?: string, method = "GET") => new NextRequest(new URL(path, "https://romaic.test"), { method, headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("redirects a dashboard page load without a session cookie to sign in", () => {
    const response = proxy(get("/admin/team?tab=all"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://romaic.test/admin/sign-in?next=%2Fadmin%2Fteam%3Ftab%3Dall");
    assert.equal(proxy(get("/admin/team", `${cookieName}=`)).status, 307, "an empty cookie is no cookie");
  });

  it("lets a page load with the cookie through, with a fresh nonce policy and no caching", () => {
    const first = proxy(get("/admin/team", `${cookieName}=${session}`));
    assert.equal(first.headers.get("x-middleware-next"), "1");
    assert.equal(first.headers.get(`x-middleware-request-${requestedPathHeader}`), "/admin/team");
    const policy = first.headers.get("content-security-policy") ?? "";
    assert.match(policy, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.equal(first.headers.get("x-middleware-request-content-security-policy"), policy, "Next.js reads the nonce from the request's policy");
    const second = proxy(get("/admin/team", `${cookieName}=${session}`));
    assert.notEqual(second.headers.get("content-security-policy"), policy, "a new nonce every time");
  });

  it("never drops a reset link's token into the sign-in redirect", () => {
    const response = proxy(get("/admin/account?token=secret-value"));
    assert.equal(response.headers.get("location")?.includes("secret-value"), false);
  });

  it("lets the link and sign-in pages through without a cookie", () => {
    for (const path of ["/admin/sign-in", "/admin/setup", "/admin/forgot-password", "/admin/reset-password?token=x", "/admin/verify-email?token=x"]) {
      assert.equal(proxy(get(path)).headers.get("x-middleware-next"), "1", path);
    }
  });

  it("sends every dashboard request to the dashboard preview in a client design preview", () => {
    const previous = process.env.DESIGN_PREVIEW;
    process.env.DESIGN_PREVIEW = "1";
    try {
      for (const request of [get("/admin"), get("/admin/sign-in"), get("/admin/team", `${cookieName}=${session}`)]) {
        const response = proxy(request);
        assert.equal(response.status, 307);
        assert.equal(response.headers.get("location"), "https://romaic.test/kit?view=admin");
      }
    } finally {
      if (previous === undefined) delete process.env.DESIGN_PREVIEW;
      else process.env.DESIGN_PREVIEW = previous;
    }
  });

  it("overwrites a requested-path header the browser sent, so pages can trust it", () => {
    const request = get("/admin/team", `${cookieName}=${session}`);
    request.headers.set(requestedPathHeader, "https://evil.example");
    assert.equal(proxy(request).headers.get(`x-middleware-request-${requestedPathHeader}`), "/admin/team");
  });

  it("passes server actions through", () => {
    const response = proxy(get("/admin/content/site", undefined, "POST"));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  it("runs for /admin, its pages and its APIs, but not its manifest and icons, or the public site", async () => {
    // Next.js's server provides AsyncLocalStorage globally; its matcher helper expects it there.
    Object.assign(globalThis, { AsyncLocalStorage });
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    const runsFor = (path: string) => unstable_doesMiddlewareMatch({ config, url: `https://romaic.test${path}` });

    for (const path of ["/admin", "/admin/", "/admin/team", "/admin/team?x=1", "/admin/sign-in", "/admin/setup", "/admin/files/abc", "/admin/manifest.webmanifest.bak"]) {
      assert.equal(runsFor(path), true, path);
    }
    for (const path of ["/admin/manifest.webmanifest", "/admin/manifest.webmanifest/icon-192.png", "/", "/kit", "/media/x", "/administrator"]) {
      assert.equal(runsFor(path), false, path);
    }
  });
});
