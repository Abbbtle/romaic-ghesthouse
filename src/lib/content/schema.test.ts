import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseWith } from "@/lib/forms/parse";
import { emailField, httpsUrlField, isoDateField, optionalHttpsUrlField, phoneField, slugField, textField, versionField } from "./fields";
import { designBudgets, listLimits, textLimits } from "./limits";
import { sitePagePaths, sitePages } from "./pages";
import {
  imageRefSchema,
  isSectionKey,
  malformedSectionMessage,
  parseSection,
  sectionDescriptions,
  sectionKeys,
  sectionNames,
  sectionPages,
  sectionPermissions,
  sectionSchemas,
  socialLinkSchema,
} from "./schema";
import { sampleContent } from "./testing/sample-content";

function errorsOf(schema: z.ZodType, input: unknown) {
  const result = parseWith(schema, input);
  return result.ok ? {} : result.errors;
}

describe("text fields", () => {
  const heading = textField({ noun: "the heading", max: 30, required: "Enter the heading." });
  const notice = textField({ noun: "the notice", max: 1200, multiline: true });

  it("tidies text as it's read", () => {
    assert.deepEqual(parseWith(heading, "  Spacious   apartments\tin Welkom. \n"), { ok: true, value: "Spacious apartments in Welkom." });
    assert.deepEqual(parseWith(heading, "Bell\u0007 rings"), { ok: true, value: "Bell rings" });
    assert.deepEqual(parseWith(notice, " First line.\r\nSecond line. "), { ok: true, value: "First line.\nSecond line." });
  });

  it("names the field in its messages", () => {
    assert.deepEqual(errorsOf(heading, "x".repeat(31)), { form: "Keep the heading to 30 characters." });
    assert.deepEqual(errorsOf(heading, "   "), { form: "Enter the heading." });
    assert.deepEqual(errorsOf(heading, undefined), { form: "Enter the heading." });
    assert.deepEqual(errorsOf(notice, "x".repeat(1201)), { form: "Keep the notice to 1,200 characters." });
  });

  it("allows optional text to be empty", () => {
    assert.deepEqual(parseWith(notice, ""), { ok: true, value: "" });
  });
});

describe("contact and identifier fields", () => {
  it("stores phone numbers in E.164, however they're typed", () => {
    const phone = phoneField("a phone number");
    assert.deepEqual(parseWith(phone, "076 957 9928"), { ok: true, value: "+27769579928" });
    assert.deepEqual(parseWith(phone, "+27 76 957 9928"), { ok: true, value: "+27769579928" });
    assert.deepEqual(parseWith(phone, "+27769579928"), { ok: true, value: "+27769579928" });
    assert.deepEqual(errorsOf(phone, "12345"), { form: "Enter a phone number like 082 123 4567 or +27 82 123 4567." });
    assert.deepEqual(errorsOf(phone, ""), { form: "Enter a phone number." });
  });

  it("checks email addresses", () => {
    assert.deepEqual(parseWith(emailField, " guesthouseromaic@gmail.com "), { ok: true, value: "guesthouseromaic@gmail.com" });
    assert.deepEqual(errorsOf(emailField, "guesthouseromaic"), { form: "Enter an email address like name@example.com." });
  });

  it("only takes https addresses, on the right site when it matters", () => {
    const credit = httpsUrlField({ noun: "the credit link", example: "https://weberu.io" });
    const map = httpsUrlField({ noun: "the map link", example: "https://maps.app.goo.gl/x", hosts: ["google.com", "goo.gl"] });
    assert.equal(parseWith(credit, "https://weberu.io").ok, true);
    assert.deepEqual(errorsOf(credit, "http://weberu.io"), { form: "Enter the credit link starting with https://, like https://weberu.io." });
    assert.deepEqual(errorsOf(credit, "javascript:alert(1)"), { form: "Enter the credit link starting with https://, like https://weberu.io." });
    assert.deepEqual(errorsOf(credit, "https://user:secret@weberu.io"), { form: "Enter the credit link starting with https://, like https://weberu.io." });
    assert.equal(parseWith(map, "https://maps.app.goo.gl/abc").ok, true);
    assert.equal(parseWith(map, "https://www.google.com/maps/place/x").ok, true);
    assert.deepEqual(errorsOf(map, "https://evil-google.com/maps"), { form: "Enter the map link on google.com, like https://maps.app.goo.gl/x." });
  });

  it("takes an optional link only as a plain https address on the sites allowed, without the parameters refused", () => {
    const link = optionalHttpsUrlField({
      noun: "the booking link",
      hosts: ["example.com"],
      message: "Paste a booking link from Example.",
      refusedParameters: { names: ["email"], message: "Remove the visitor's details." },
    });
    assert.deepEqual(parseWith(link, ""), { ok: true, value: "" });
    assert.deepEqual(parseWith(link, " https://example.com/pay/a?ref=RG-7K2QX "), { ok: true, value: "https://example.com/pay/a?ref=RG-7K2QX" });
    for (const value of ["https://evil-example.com/a", "https:/example.com/a", "https://example.com\\@evil.io/a", "https://ｅｘａｍｐｌｅ.com/a"]) {
      assert.deepEqual(errorsOf(link, value), { form: "Paste a booking link from Example." }, value);
    }
    for (const value of ["https://example.com/a?email=x", "https://example.com/a#email=x"]) {
      assert.deepEqual(errorsOf(link, value), { form: "Remove the visitor's details." }, value);
    }
  });

  it("checks link names, versions and dates", () => {
    assert.equal(parseWith(slugField("the link name"), "family-room").ok, true);
    assert.deepEqual(errorsOf(slugField("the link name"), "Family room"), {
      form: "Use lower-case letters, numbers and single dashes for the link name, like one-to-one.",
    });
    assert.equal(parseWith(versionField, "1.0").ok, true);
    assert.equal(parseWith(versionField, "v2").ok, false);
    assert.equal(parseWith(isoDateField("the date"), "2026-11-12").ok, true);
    assert.deepEqual(errorsOf(isoDateField("the date"), "2026-02-30"), { form: "Enter the date as a date like 2026-10-20." });
  });
});

describe("shared shapes", () => {
  const photo = { src: "/images/apartment.jpg", alt: "A made bed with red cushions", width: 1500, height: 1000 };

  it("accepts default and uploaded photos, and centres the focus unless it's set", () => {
    assert.deepEqual(parseWith(imageRefSchema, photo), { ok: true, value: { ...photo, focus: { x: 50, y: 50 } } });
    const upload = { ...photo, src: "/media/0b5f6c1e-2f4a-4c8e-9d1a-3b7c5e9f2a10", focus: { x: 40, y: 28 } };
    assert.deepEqual(parseWith(imageRefSchema, upload), { ok: true, value: upload });
  });

  it("refuses photos from anywhere else, and photos without a description", () => {
    for (const src of ["https://example.com/a.jpg", "/images/../secret.jpg", "//example.com/a.jpg", "/media/not-an-id", "/images/logo.svg"]) {
      assert.deepEqual(errorsOf(imageRefSchema, { ...photo, src }), { src: "Upload the photo again: its address isn't one this site serves." }, src);
    }
    assert.deepEqual(errorsOf(imageRefSchema, { ...photo, alt: " " }), { alt: "Describe the photo for people who can't see it." });
  });

  it("keeps each social link on its own platform's site, over https", () => {
    assert.equal(parseWith(socialLinkSchema, { platform: "facebook", url: "https://www.facebook.com/romaicguesthouse" }).ok, true);
    assert.equal(parseWith(socialLinkSchema, { platform: "x", url: "https://twitter.com/romaic" }).ok, true);
    assert.deepEqual(errorsOf(socialLinkSchema, { platform: "instagram", url: "https://facebook.com/romaic" }), {
      url: "Enter your Instagram link on instagram.com, like https://www.instagram.com/yourname.",
    });
    assert.deepEqual(errorsOf(socialLinkSchema, { platform: "tiktok", url: "tiktok.com/@romaic" }), {
      url: "Enter your TikTok link starting with https://, like https://www.tiktok.com/@yourname.",
    });
  });
});

describe("section rules", () => {
  it("accepts the sample content", () => {
    const content = sampleContent();
    for (const key of sectionKeys) assert.deepEqual(parseWith(sectionSchemas[key], content[key]), { ok: true, value: content[key] }, key);
  });

  it("needs the business name and the address's street, suburb and town; province and postal code are optional", () => {
    const site = sampleContent().site;
    site.businessName = " ";
    site.address = { ...site.address, street: "", area: "", city: "", province: "", postalCode: "" };
    assert.deepEqual(errorsOf(sectionSchemas.site, site), {
      businessName: "Enter the business name.",
      "address.street": "Enter the street address, like 286 Stateway.",
      "address.area": "Enter the suburb, like Bedelia.",
      "address.city": "Enter the town or city, like Welkom.",
    });
  });

  it("enforces list bounds with friendly messages", () => {
    const site = sampleContent().site;
    site.socialLinks = Array.from({ length: listLimits.socialLinks.max + 1 }, () => ({ platform: "facebook" as const, url: "https://facebook.com/x" }));
    assert.deepEqual(errorsOf(sectionSchemas.site, site), { socialLinks: "Keep it to 6 social links." });
  });

  it("checks contact details: a real phone number, an optional separate WhatsApp number, an email address", () => {
    const contact = { ...sampleContent().contact, phone: "123", whatsapp: "082 123 4567", email: "nope", whatsappMessage: "" };
    assert.deepEqual(errorsOf(sectionSchemas.contact, contact), {
      phone: "Enter a phone number like 082 123 4567 or +27 82 123 4567.",
      email: "Enter an email address like name@example.com.",
      whatsappMessage: "Enter the message WhatsApp opens with.",
    });
    assert.equal(parseWith(sectionSchemas.contact, { ...sampleContent().contact, whatsapp: "082 123 4567" }).ok, true);
  });

  it("has a search title and description for every page, within search engines' limits", () => {
    const seo = sampleContent().seo;
    assert.deepEqual(Object.keys(seo.pages).sort(), [...sitePages].sort());
    seo.pages.home.title = "x".repeat(textLimits.seoTitle + 1);
    seo.pages.privacy.description = "";
    assert.deepEqual(errorsOf(sectionSchemas.seo, seo), {
      "pages.home.title": "Keep the title to 60 characters.",
      "pages.privacy.description": "Enter the description search engines show for this page.",
    });
  });

  it("only fills in the placeholders a text allows, and refuses links legal text can't safely show", () => {
    const privacy = sampleContent().privacy;
    privacy.body = "Ask {owner} about {businessName}.";
    assert.deepEqual(errorsOf(sectionSchemas.privacy, privacy), {
      body: "Remove {owner}. This text can use {businessName}, {location}, {email} and {phone}.",
    });
    privacy.body = "Read [this](javascript:alert(1)).";
    assert.deepEqual(errorsOf(sectionSchemas.privacy, privacy), {
      body: 'Fix the link "this": links must start with https://, mailto: or tel:, or be a page on this site such as /book.',
    });
  });

  it("never shows zod's own wording when part of a section is missing or the wrong shape", () => {
    const site: Record<string, unknown> = { ...sampleContent().site, address: undefined, socialLinks: "Facebook" };
    assert.deepEqual(parseSection("site", site), {
      ok: false,
      errors: { address: malformedSectionMessage, socialLinks: "Add a list of social links." },
    });
    assert.deepEqual(parseSection("privacy", null), { ok: false, errors: { form: malformedSectionMessage } });
  });

  it("knows its sections, each with a name, description, page and permission", () => {
    assert.equal(isSectionKey("site"), true);
    assert.equal(isSectionKey("terms"), false);
    assert.equal(isSectionKey("toString"), false);
    for (const key of sectionKeys) {
      const page = sectionPages[key];
      assert.ok(sectionNames[key] && sectionDescriptions[key] && (page === null ? key === "messages" : sitePagePaths[page]), key);
      assert.ok(sectionPermissions[key], key);
    }
  });

  it("keeps the contact details and booking terms behind their own permissions, apart from site content", () => {
    assert.deepEqual(sectionPermissions, {
      site: "content:edit",
      contact: "settings:contact",
      bookingTerms: "settings:booking-rules",
      messages: "settings:booking-rules",
      home: "content:edit",
      apartments: "content:edit",
      gallery: "content:edit",
      facilities: "content:edit",
      location: "content:edit",
      policies: "content:edit",
      contactPage: "content:edit",
      book: "content:edit",
      seo: "content:edit",
      privacy: "content:edit",
    });
  });

  it("keeps the design's soft budgets inside the hard limits", () => {
    for (const [name, budget] of Object.entries(designBudgets) as [keyof typeof textLimits, number][]) {
      assert.ok(budget <= textLimits[name], name);
    }
  });
});
