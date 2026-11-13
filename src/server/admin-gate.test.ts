import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminGate, type AdminRequest } from "./admin-gate";

const request = (method: string, url: string, hasSessionCookie: boolean): AdminRequest => {
  const { pathname, searchParams } = new URL(url, "https://romaic.test");
  return { method, pathname, searchParams, hasSessionCookie };
};

describe("adminGate", () => {
  it("sends a dashboard page load without a session cookie to sign in, and back afterwards", () => {
    assert.deepEqual(adminGate(request("GET", "/admin/diary?date=2026-10-20&view=week", false)), {
      action: "sign-in",
      location: "/admin/sign-in?next=%2Fadmin%2Fdiary%3Fdate%3D2026-10-20%26view%3Dweek",
    });
    assert.deepEqual(adminGate(request("HEAD", "/admin/requests", false)), { action: "sign-in", location: "/admin/sign-in?next=%2Fadmin%2Frequests" });
    assert.deepEqual(adminGate(request("GET", "/admin", false)), { action: "sign-in", location: "/admin/sign-in" }, "home needs no ?next=");
  });

  it("lets a page load with the cookie through, renewing the cookie, and says which path was asked for", () => {
    assert.deepEqual(adminGate(request("GET", "/admin/diary?date=2026-10-20&_rsc=1a2b", true)), {
      action: "continue",
      requestedPath: "/admin/diary?date=2026-10-20",
    });
  });

  it("leaves the pages that create a session, the APIs and the manifest open, without renewing anything", () => {
    for (const path of ["/admin/sign-in", "/admin/sign-in?next=%2Fadmin%2Fdiary", "/admin/setup", "/admin/api/pulse", "/admin/manifest.webmanifest"]) {
      for (const hasSessionCookie of [false, true]) {
        const decision = adminGate(request("GET", path, hasSessionCookie));
        assert.equal(decision.action, "continue", path);
      }
    }
  });

  it("never redirects a server action's post, which checks the session itself", () => {
    assert.deepEqual(adminGate(request("POST", "/admin/content/home", false)), {
      action: "continue",
      requestedPath: "/admin/content/home",
    });
    assert.equal(adminGate(request("POST", "/admin/content/home", true)).action, "continue");
  });

  it("treats look-alike paths as the dashboard pages they are", () => {
    assert.equal(adminGate(request("GET", "/admin/sign-in-help", false)).action, "sign-in");
    assert.equal(adminGate(request("GET", "/admin/apis", false)).action, "sign-in");
    assert.equal(adminGate(request("GET", "/admin/manifest.webmanifest.bak", false)).action, "sign-in");
  });
});
