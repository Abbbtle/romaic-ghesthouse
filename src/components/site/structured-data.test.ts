import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { jsonLdText, lodgingBusinessData } from "./structured-data";

describe("the site's schema.org data", () => {
  it("says only confirmed facts: no unconfirmed apartment, facility or time, and never a rating, star or price", () => {
    const content = sampleContent();
    content.facilities.groups[0]!.items.push({ icon: "garden", label: "Garden", note: "", confirmed: false });
    content.policies.checkIn.confirmed = false;
    const data = lodgingBusinessData(content, "https://www.example.com");
    assert.equal(data["@type"], "LodgingBusiness");
    assert.deepEqual(
      (data.amenityFeature ?? []).map((feature) => feature.name),
      ["Wi-Fi"],
    );
    assert.equal("checkinTime" in data, false);
    assert.equal(data.checkoutTime, "10:00");
    assert.deepEqual(
      (data.containsPlace ?? []).map((room) => room.name),
      ["Sample double"],
      "the unconfirmed apartment is left out",
    );
    const text = JSON.stringify(data);
    assert.doesNotMatch(text, /starRating|aggregateRating|review|priceRange|"image"/);
  });

  it("can't be broken out of its script tag", () => {
    assert.equal(jsonLdText({ name: "</script><script>alert(1)</script>" }), '{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}');
  });
});
