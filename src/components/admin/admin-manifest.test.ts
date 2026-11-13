import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminIcons, adminManifest, isAdminIconName } from "./admin-manifest";

describe("the dashboard's web-app manifest", () => {
  it("installs as the Romaic Guesthouse dashboard, opening on Today and staying within the dashboard", () => {
    const manifest = adminManifest();
    assert.equal(manifest.name, "Romaic Guesthouse dashboard");
    assert.equal(manifest.start_url, "/admin");
    assert.equal(manifest.scope, "/admin");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.background_color, "#ECE8DD");
    assert.equal(manifest.theme_color, "#111D29");
  });

  it("lists the icons its icon route draws, with a maskable one whose mark stays inside the safe circle", () => {
    const icons = adminManifest().icons ?? [];
    assert.deepEqual(
      icons.map((icon) => [icon.src, icon.sizes, icon.purpose]),
      [
        ["/admin/manifest.webmanifest/icon-192.png", "192x192", "any"],
        ["/admin/manifest.webmanifest/icon-512.png", "512x512", "any"],
        ["/admin/manifest.webmanifest/maskable-512.png", "512x512", "maskable"],
      ],
    );
    // The mark is a square; its corners must be within 40% of the size from the centre.
    const { padding } = adminIcons["maskable-512.png"];
    assert.ok(Math.SQRT2 * (0.5 - padding) <= 0.4);
  });

  it("knows its icons by name", () => {
    assert.equal(isAdminIconName("icon-192.png"), true);
    assert.equal(isAdminIconName("constructor"), false);
    assert.equal(isAdminIconName("../icon.svg"), false);
  });
});
