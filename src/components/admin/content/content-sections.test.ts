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
    const pages = ["home", "apartments", "gallery", "facilities", "location", "policies", "contactPage", "book"];
    assert.deepEqual(editableSections({ role: "owner" }), ["site", "contact", "bookingTerms", "messages", ...pages, "seo", "privacy"]);
    // Admins (Weberu) look after the site, but never the contact details guests use or the terms that move money.
    assert.deepEqual(editableSections({ role: "admin" }), ["site", ...pages, "seo", "privacy"]);
    assert.deepEqual(editableSections({ role: "sales" }), []);
    assert.deepEqual(editableSections({ role: "staff" }), []);
    assert.deepEqual(visibleContentGroups(editableSections({ role: "admin" })), [
      { title: "Your business", sections: ["site"] },
      { title: "Pages", sections: pages },
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
    assert.equal(contentPageHref("contact"), "/contact");
    assert.equal(contentPageHref("bookingTerms"), "/policies");
    assert.equal(contentPageHref("apartments"), "/apartments");
    assert.equal(contentPageHref("contactPage"), "/contact");
    assert.equal(contentPageHref("privacy"), "/privacy");
  });
});
