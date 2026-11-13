import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicAdminPath, safeAdminDestination, signInPath } from "./admin-paths";

describe("safeAdminDestination", () => {
  it("keeps a dashboard page on this site, with its query and fragment", () => {
    assert.equal(safeAdminDestination("/admin"), "/admin");
    assert.equal(safeAdminDestination("/admin/diary?date=2026-10-20&view=day"), "/admin/diary?date=2026-10-20&view=day");
    assert.equal(safeAdminDestination("/admin/content/home#hero"), "/admin/content/home#hero");
  });

  it("never sends anyone to another site, however the address is dressed up", () => {
    for (const value of [
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example",
      "\\\\evil.example",
      "/admin\\..\\..\\evil",
      "javascript:alert(1)",
      "/\u0000/evil.example",
      "/\t/evil.example",
      "/admin\n/x",
      " /admin",
      "admin/diary",
      "",
    ]) {
      assert.equal(safeAdminDestination(value), "/admin", JSON.stringify(value));
    }
  });

  it("only goes back to dashboard pages, never the public site, the APIs, or the pages that would bounce", () => {
    for (const value of ["/", "/book", "/administrator", "/admin/../book", "/admin/%2e%2e/book", "/admin/api/pulse", "/admin/sign-in", "/admin/sign-in?next=/admin", "/admin/setup"]) {
      assert.equal(safeAdminDestination(value), "/admin", value);
    }
  });

  it("takes only a single string, so a repeated or missing parameter falls back to the dashboard's home", () => {
    for (const value of [null, undefined, ["/admin/diary", "/admin/requests"], 42, { toString: () => "/admin/diary" }]) {
      assert.equal(safeAdminDestination(value), "/admin");
    }
  });
});

describe("signInPath", () => {
  it("asks to come back to where someone was going, unless that's the dashboard's home", () => {
    assert.equal(signInPath("/admin/requests?tab=pending"), "/admin/sign-in?next=%2Fadmin%2Frequests%3Ftab%3Dpending");
    assert.equal(signInPath("/admin"), "/admin/sign-in");
    assert.equal(signInPath("https://evil.example"), "/admin/sign-in");
    assert.equal(signInPath(null), "/admin/sign-in");
  });
});

describe("isPublicAdminPath", () => {
  it("opens the pages that create a session, the APIs and the manifest with its icons, and nothing that merely starts like them", () => {
    for (const path of ["/admin/sign-in", "/admin/setup", "/admin/api", "/admin/api/pulse", "/admin/manifest.webmanifest", "/admin/manifest.webmanifest/icon-192.png"]) {
      assert.equal(isPublicAdminPath(path), true, path);
    }
    for (const path of ["/admin", "/admin/diary", "/admin/sign-in-help", "/admin/apis", "/admin/setup2", "/admin/manifest.webmanifest.bak"]) {
      assert.equal(isPublicAdminPath(path), false, path);
    }
  });
});
