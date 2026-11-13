import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { siteFacts } from "@/lib/content/derive";
import { isAllowedHref, markdownProblems, parseMarkdown, type MarkdownBlock, type MarkdownInline } from "@/lib/content/markdown";
import { parseSection, sectionKeys } from "@/lib/content/schema";
import { createContentService } from "@/lib/content/service";
import { testContentAccess } from "@/lib/content/testing/access";
import { createMemoryContentStore } from "@/lib/content/testing/memory-store";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock } from "@/lib/kernel/ports";
import { contentDefaults } from "./defaults";

describe("Romaic's seed content", () => {
  it("validates, section by section, exactly as written", () => {
    for (const key of sectionKeys) {
      assert.deepEqual(parseSection(key, contentDefaults[key]), { ok: true, value: contentDefaults[key] }, key);
    }
  });

  it("comes back the same after being stored as JSON", () => {
    for (const key of sectionKeys) {
      const stored: unknown = JSON.parse(JSON.stringify(contentDefaults[key]));
      assert.deepEqual(parseSection(key, stored), { ok: true, value: contentDefaults[key] }, key);
    }
  });

  it("is what the content service serves before anyone edits it", async () => {
    const service = createContentService({
      store: createMemoryContentStore(),
      defaults: contentDefaults,
      clock: fixedClock("2026-11-12T08:00:00Z"),
      timeZone: "Africa/Johannesburg",
      audit: memoryAuditRecorder(),
      access: testContentAccess,
    });
    assert.deepEqual(await service.getAll(), contentDefaults);
  });

  it("uses the client's own facts: name, address, phone and email from the brand guide", () => {
    assert.equal(contentDefaults.site.businessName, "Romaic Guesthouse");
    assert.deepEqual(
      [contentDefaults.site.address.street, contentDefaults.site.address.area, contentDefaults.site.address.city],
      ["286 Stateway", "Bedelia", "Welkom"],
    );
    assert.equal(contentDefaults.contact.phone, "+27769579928");
    assert.equal(contentDefaults.contact.whatsapp, null, "one number takes calls and WhatsApp");
    assert.equal(contentDefaults.contact.email, "guesthouseromaic@gmail.com");
  });

  it("claims nothing the client hasn't confirmed", () => {
    const copy = JSON.stringify(contentDefaults);
    // Solar backup is only in the Booking.com listing; star grades and review scores aren't ours to claim.
    assert.doesNotMatch(copy, /solar/i);
    assert.doesNotMatch(copy, /\bstars?\b|\b\d(?:\.\d)? out of\b|rated/i);
    assert.doesNotMatch(copy, /\brooms?\b/i, "the client calls them apartments");
    assert.equal(contentDefaults.site.address.postalCode, "", "the postal code waits for the client");
  });

  it("keeps edits within the limits", () => {
    const seo = structuredClone(contentDefaults.seo);
    seo.pages.home.title = `${seo.pages.home.title} in the heart of the Free State`;
    assert.deepEqual(parseSection("seo", seo), { ok: false, errors: { "pages.home.title": "Keep the title to 60 characters." } });
  });

  it("uses SA spelling in site copy", () => {
    const copy = JSON.stringify(contentDefaults);
    assert.doesNotMatch(copy, /\b(?:color|center|organization|traveler|program)\b/i);
  });
});

describe("privacy notice draft", () => {
  const body = contentDefaults.privacy.body;

  it("is limited Markdown with no problems", () => {
    assert.deepEqual(markdownProblems(body), []);
  });

  it("says it's a draft and leaves every unknown legal fact for the owner", () => {
    assert.match(body, /^\*\*Draft for the owner to review/);
    for (const blank of ["companies that process", "country where the website's data is stored", "how long you keep", "name of the Information Officer"]) {
      assert.ok(body.includes(blank), blank);
    }
    assert.equal(contentDefaults.privacy.version, "0.1");
  });

  it("renders with the business and contact details filled in, every link allowed", () => {
    const blocks = parseMarkdown(body, siteFacts(contentDefaults.site, contentDefaults.contact));
    const text = blocks.map(blockText).join("\n");
    assert.doesNotMatch(text, /\{[A-Za-z]+\}/);
    assert.match(text, /Romaic Guesthouse, 286 Stateway, Bedelia, Welkom/);
    assert.match(text, /\+27 76 957 9928/);
    for (const href of blocks.flatMap(blockLinks)) assert.ok(isAllowedHref(href), href);
  });
});

function inlineText(node: MarkdownInline): string {
  if (node.type === "text") return node.text;
  if (node.type === "break") return " ";
  return node.children.map(inlineText).join("");
}

function blockText(block: MarkdownBlock): string {
  if (block.type === "list") return block.items.map((item) => item.map(inlineText).join("")).join("\n");
  return block.children.map(inlineText).join("");
}

function inlineLinks(node: MarkdownInline): string[] {
  if (node.type === "text" || node.type === "break") return [];
  return [...(node.type === "link" ? [node.href] : []), ...node.children.flatMap(inlineLinks)];
}

function blockLinks(block: MarkdownBlock): string[] {
  return (block.type === "list" ? block.items.flat() : block.children).flatMap(inlineLinks);
}
