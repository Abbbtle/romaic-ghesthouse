import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sectionKeys } from "@/lib/content/schema";
import { contentEditorHref, contentGroups, contentPageHref, contentRevisionHref, editableSections, visibleContentGroups } from "./content-sections";

describe("finding the content", () => {
  it("lists every section exactly once", () => {
    const listed = contentGroups.flatMap((group) => group.sections);
    assert.deepEqual([...listed].sort(), [...sectionKeys].sort());
  });

  it("shows each person only the sections they may edit, without empty groups", () => {
    assert.deepEqual(editableSections({ role: "owner" }), ["site", "contact", "seo", "privacy"]);
    assert.deepEqual(editableSections({ role: "admin" }), ["site", "seo", "privacy"]);
    assert.deepEqual(editableSections({ role: "sales" }), []);
    assert.deepEqual(visibleContentGroups(editableSections({ role: "admin" })), [
      { title: "Your business", sections: ["site"] },
      { title: "Your website", sections: ["seo", "privacy"] },
    ]);
    assert.deepEqual(visibleContentGroups(["privacy"]), [{ title: "Your website", sections: ["privacy"] }]);
    assert.deepEqual(visibleContentGroups([]), []);
  });

  it("links each editor, a part of it, and an earlier version", () => {
    assert.equal(contentEditorHref("site"), "/admin/content/site");
    assert.equal(contentEditorHref("site", "address"), "/admin/content/site#address");
    assert.equal(contentRevisionHref("privacy", 3), "/admin/content/privacy/history/3");
  });

  it("views each section on the page it feeds", () => {
    assert.equal(contentPageHref("site"), "/");
    assert.equal(contentPageHref("contact"), "/");
    assert.equal(contentPageHref("privacy"), "/privacy");
  });
});
