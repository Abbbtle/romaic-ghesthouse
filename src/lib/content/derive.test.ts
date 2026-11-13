import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addressLine, areaLine, generalWhatsappLink, initials, mapLink, priceDisplay, siteFacts, socialLinkLabel, whatsappNumber } from "./derive";
import { sampleContent } from "./testing/sample-content";

describe("business and contact details", () => {
  const { site, contact } = sampleContent();

  it("writes the address in full or short", () => {
    assert.equal(addressLine(site.address), "1 Test Street, Testville, Sampleton");
    assert.equal(areaLine(site.address), "Testville, Sampleton");
  });

  it("links to Google Maps, unless a map link is set", () => {
    assert.equal(mapLink(site.address), "https://maps.google.com/?q=1%20Test%20Street%2C%20Testville%2C%20Sampleton%2C%20Free%20State");
    const pinned = { ...site.address, mapUrl: "https://maps.app.goo.gl/abc" };
    assert.equal(mapLink(pinned), "https://maps.app.goo.gl/abc");
  });

  it("opens WhatsApp with the general message, on the WhatsApp number when there's one", () => {
    assert.equal(whatsappNumber(contact), "+27821234567");
    assert.equal(generalWhatsappLink(contact), "https://wa.me/27821234567?text=Hi%2C%20I'd%20like%20to%20ask%20about%20a%20stay.");
    const separate = { ...contact, whatsapp: "+27831234567" };
    assert.equal(whatsappNumber(separate), "+27831234567");
  });

  it("fills in the facts legal text refers to, from the business and contact details", () => {
    assert.deepEqual(siteFacts(site, contact), {
      businessName: "Sample Guesthouse",
      location: "1 Test Street, Testville, Sampleton",
      email: "hello@example.com",
      phone: "+27 82 123 4567",
    });
  });

  it("names social links", () => {
    const [link] = site.socialLinks;
    assert.ok(link);
    assert.equal(socialLinkLabel(site, link), "Sample Guesthouse on Facebook");
  });
});

describe("prices", () => {
  it("formats every price the same way, and a missing one as on request", () => {
    assert.deepEqual(priceDisplay(1250, "night"), { amount: "R1,250", unit: "/night", unitSpoken: " per night" });
    assert.deepEqual(priceDisplay(300, "once-off"), { amount: "R300", unit: "", unitSpoken: "" });
    assert.deepEqual(priceDisplay(null, "night"), { amount: "Price on request", unit: "", unitSpoken: "" });
  });
});

describe("people", () => {
  it("makes avatar initials", () => {
    assert.equal(initials("Thandi Mokoena"), "TM");
    assert.equal(initials("Sipho"), "S");
    assert.equal(initials("  élan  de  Villiers "), "ÉV");
    assert.equal(initials(""), "");
  });
});
