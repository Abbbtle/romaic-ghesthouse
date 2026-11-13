import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../../../next.config";
import { apartmentPath, movedPages, sitePageNames, sitePagePaths } from "./pages";

describe("the rooms pages' addresses", () => {
  it("lists the rooms at /rooms, never as apartments", () => {
    assert.equal(sitePagePaths.apartments, "/rooms");
    assert.equal(sitePageNames.apartments, "Rooms");
    assert.equal(apartmentPath("family-shower"), "/rooms/family-shower");
  });

  it("sends the old /apartments addresses to the rooms pages permanently", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const [source, destination] of [
      ["/apartments", "/rooms"],
      ["/apartments/:slug", "/rooms/:slug"],
    ] as const) {
      assert.ok(movedPages.some((page) => page.source === source && page.destination === destination), source);
      const redirect = redirects.find((item) => item.source === source);
      assert.ok(redirect, `${source} redirects`);
      assert.equal(redirect.destination, destination);
      assert.equal(redirect.permanent, true, `${source} is permanent (308)`);
    }
  });
});
