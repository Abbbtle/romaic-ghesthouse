import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sectionKeys } from "@/lib/content/schema";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { revisionFields } from "./revision-fields";

describe("an earlier version as a list of fields", () => {
  it("lists every section's fields with its editor's labels", () => {
    const content = sampleContent();
    for (const key of sectionKeys) {
      const fields = revisionFields(key, content[key]);
      assert.ok(fields.length > 0, key);
      for (const field of fields) assert.ok(field.label, key);
    }
  });

  it("shows contact numbers the way South Africans write them, and a shared WhatsApp number as the phone's", () => {
    const fields = revisionFields("contact", sampleContent().contact);
    assert.deepEqual(fields.slice(0, 2), [
      { label: "Phone number", value: "+27 82 123 4567" },
      { label: "WhatsApp number", value: "Same as the phone number" },
    ]);
  });

  it("lists social links and the footer credit as readable text", () => {
    const fields = revisionFields("site", sampleContent().site);
    assert.deepEqual(
      fields.find((field) => field.label === "Social links"),
      { label: "Social links", value: "Facebook: https://www.facebook.com/sample", multiline: true },
    );
    assert.equal(fields.find((field) => field.label === "Footer credit")?.value, "Site by Sample Studio · https://example.com");
  });

  it("names each page's search title and description", () => {
    assert.deepEqual(
      revisionFields("seo", sampleContent().seo).map((field) => field.label),
      ["Home: title", "Home: description", "Privacy notice: title", "Privacy notice: description"],
    );
  });
});
