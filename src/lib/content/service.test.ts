import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Actor } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock } from "@/lib/kernel/ports";
import type { ContentStore } from "./ports";
import { sectionKeys } from "./schema";
import {
  changedPaths,
  createContentService,
  reloadSectionMessage,
  staleSectionMessage,
  unknownRevisionMessage,
  unknownSectionMessage,
  unreadableRevisionMessage,
  type InvalidStoredSection,
} from "./service";
import { TestNotAllowedError, testContentAccess } from "./testing/access";
import { createMemoryContentStore } from "./testing/memory-store";
import { sampleContent } from "./testing/sample-content";

const owner: Actor = { id: "account-owner", role: "owner", name: "Owner" };
const admin: Actor = { id: "account-admin", role: "admin", name: "Weberu" };
const sales: Actor = { id: "account-sales", role: "sales", name: "Sales" };
const staff: Actor = { id: "account-staff", role: "staff", name: "Staff" };
const timeZone = "Africa/Johannesburg";

function setUp(store: ContentStore = createMemoryContentStore(), clock = fixedClock("2026-11-10T08:00:00Z")) {
  const problems: InvalidStoredSection[] = [];
  const audit = memoryAuditRecorder();
  const service = createContentService({
    store,
    defaults: sampleContent(),
    clock,
    timeZone,
    audit,
    access: testContentAccess,
    onInvalidSection: (problem) => problems.push(problem),
  });
  return { service, store, problems, audit };
}

describe("content service: reading", () => {
  it("serves the defaults and stores them the first time it's used", async () => {
    const { service, store } = setUp();
    assert.deepEqual(await service.getAll(), sampleContent());
    assert.deepEqual(await store.load("site"), { key: "site", data: sampleContent().site, revision: 1, savedAt: null });
  });

  it("keeps sections that are already stored when it seeds", async () => {
    const edited = { ...sampleContent().contact, whatsappMessage: "Hello there" };
    const { service } = setUp(createMemoryContentStore([{ key: "contact", data: edited, revision: 7 }]));
    assert.equal((await service.getAll()).contact.whatsappMessage, "Hello there");
    assert.deepEqual(await service.getEditable(owner, "contact"), { data: edited, revision: 7, recovered: false, savedAt: null });
  });

  it("shows the default for a stored section that no longer validates, and reports it once", async () => {
    const broken = { ...sampleContent().site, businessName: "" };
    const { service, problems } = setUp(createMemoryContentStore([{ key: "site", data: broken, revision: 3 }]));

    assert.deepEqual((await service.getAll()).site, sampleContent().site);
    assert.deepEqual(await service.getSection("site"), sampleContent().site);
    assert.deepEqual(await service.getEditable(owner, "site"), { data: sampleContent().site, revision: 3, recovered: true, savedAt: null });
    assert.deepEqual(problems, [{ key: "site", revision: 3, errors: { businessName: "Enter the business name." } }]);
  });

  it("fills in fields a section was saved without, keeping what it was saved with", async () => {
    const savedBeforeTheCreditExisted: Record<string, unknown> = { ...sampleContent().site, description: "An older description." };
    delete savedBeforeTheCreditExisted.footerCredit;
    const { service, problems } = setUp(createMemoryContentStore([{ key: "site", data: savedBeforeTheCreditExisted, revision: 2 }]));
    const site = await service.getSection("site");
    assert.equal(site.description, "An older description.");
    assert.deepEqual(site.footerCredit, sampleContent().site.footerCredit);
    assert.deepEqual(problems, []);
  });

  it("hands out copies, so a page changing what it's given changes nothing for the next", async () => {
    const { service } = setUp(createMemoryContentStore([{ key: "site", data: "not a section", revision: 2 }]));
    const first = await service.getSection("site");
    first.socialLinks.reverse();
    first.description = "Changed by a page";
    assert.deepEqual(await service.getSection("site"), sampleContent().site);
  });

  it("ignores sections it doesn't know", async () => {
    const { service } = setUp(createMemoryContentStore([{ key: "retired", data: { old: true }, revision: 1 }]));
    assert.deepEqual(await service.getAll(), sampleContent());
  });

  it("tries seeding again after it fails", async () => {
    const store = createMemoryContentStore();
    let failures = 1;
    const flaky: ContentStore = {
      ...store,
      seedMissing: async (defaults) => {
        if (failures-- > 0) throw new Error("database unavailable");
        return store.seedMissing(defaults);
      },
    };
    const { service } = setUp(flaky);
    await assert.rejects(service.getAll(), /database unavailable/);
    assert.deepEqual(await service.getAll(), sampleContent());
    assert.equal((await store.loadAll()).length, sectionKeys.length);
  });

  it("refuses defaults that don't validate", () => {
    const defaults = sampleContent();
    defaults.site.businessName = "";
    assert.throws(
      () =>
        createContentService({
          store: createMemoryContentStore(),
          defaults,
          clock: fixedClock("2026-11-10T08:00:00Z"),
          timeZone,
          audit: memoryAuditRecorder(),
          access: testContentAccess,
        }),
      /"site" isn't valid/,
    );
  });
});

describe("content service: who may edit what", () => {
  it("lists only the sections someone may edit, in the dashboard's order", async () => {
    const saved = new Date("2026-11-09T14:02:00Z");
    const store = createMemoryContentStore([{ key: "seo", data: { pages: "broken" }, revision: 3, savedAt: saved }]);
    const { service } = setUp(store);
    assert.deepEqual(
      (await service.getSummaries(owner)).map(({ key }) => key),
      [...sectionKeys],
    );
    assert.deepEqual(
      (await service.getSummaries(admin)).map(({ key }) => key),
      sectionKeys.filter((key) => key !== "contact" && key !== "bookingTerms" && key !== "messages"),
      "contact details and booking terms are the owner's alone",
    );
    assert.deepEqual(await service.getSummaries(sales), []);
    assert.deepEqual(await service.getSummaries(staff), []);
    const summaries = await service.getSummaries(owner);
    assert.deepEqual(summaries.find(({ key }) => key === "site"), { key: "site", revision: 1, recovered: false, savedAt: null });
    assert.deepEqual(summaries.find(({ key }) => key === "seo"), { key: "seo", revision: 3, recovered: true, savedAt: saved });
  });

  it("lets admins edit site content but never the contact details", async () => {
    const { service, store } = setUp();
    const site = await service.getEditable(admin, "site");
    assert.deepEqual(await service.saveSection(admin, "site", { ...site.data, description: "By Weberu." }, site.revision), { ok: true, revision: 2 });

    await assert.rejects(service.getEditable(admin, "contact"), TestNotAllowedError);
    await assert.rejects(service.saveSection(admin, "contact", { ...sampleContent().contact, phone: "+27820000000" }, 1), TestNotAllowedError);
    await assert.rejects(service.listRevisions(admin, "contact"), TestNotAllowedError);
    await assert.rejects(service.getRevision(admin, "contact", 1), TestNotAllowedError);
    await assert.rejects(service.restoreRevision(admin, "contact", 1, 1), TestNotAllowedError);
    assert.equal((await store.load("contact"))?.revision, 1, "nothing was saved");
  });

  it("refuses sales and staff any content at all", async () => {
    const { service } = setUp();
    for (const actor of [sales, staff]) {
      for (const key of sectionKeys) {
        await assert.rejects(service.getEditable(actor, key), TestNotAllowedError, `${actor.role} ${key}`);
        await assert.rejects(service.saveSection(actor, key, sampleContent()[key], 1), TestNotAllowedError, `${actor.role} saving ${key}`);
        await assert.rejects(service.listRevisions(actor, key), TestNotAllowedError, `${actor.role} history of ${key}`);
      }
    }
  });

  it("lets the owner edit the contact details", async () => {
    const { service } = setUp();
    const contact = await service.getEditable(owner, "contact");
    assert.deepEqual(await service.saveSection(owner, "contact", { ...contact.data, email: "bookings@example.com" }, contact.revision), {
      ok: true,
      revision: 2,
    });
    assert.equal((await service.getSection("contact")).email, "bookings@example.com");
  });
});

describe("content service: saving", () => {
  it("saves a section over the revision it was edited from", async () => {
    const { service } = setUp();
    const { data, revision } = await service.getEditable(owner, "site");
    const edited = { ...data, description: "  Spacious,\n self-catering rooms.  " };

    assert.deepEqual(await service.saveSection(owner, "site", edited, revision), { ok: true, revision: revision + 1 });
    const saved = await service.getEditable(owner, "site");
    assert.equal(saved.data.description, "Spacious, self-catering rooms.");
    assert.equal(saved.revision, revision + 1);
    assert.equal((await service.getAll()).site.description, "Spacious, self-catering rooms.");
  });

  it("records when a section was saved, as the clock tells it", async () => {
    const { service, store } = setUp(createMemoryContentStore(), fixedClock("2026-11-11T09:45:00Z"));
    const { data, revision } = await service.getEditable(owner, "contact");
    assert.equal((await service.getEditable(owner, "contact")).savedAt, null, "a seeded default was saved by nobody");
    await service.saveSection(owner, "contact", { ...data, whatsappMessage: "Hello" }, revision);
    assert.deepEqual((await service.getEditable(owner, "contact")).savedAt, new Date("2026-11-11T09:45:00Z"));
    assert.deepEqual((await store.load("contact"))?.savedAt, new Date("2026-11-11T09:45:00Z"));
  });

  it("refuses a save over someone else's, and keeps theirs", async () => {
    const { service } = setUp();
    const { data, revision } = await service.getEditable(owner, "contact");
    assert.equal((await service.saveSection(owner, "contact", { ...data, whatsappMessage: "First" }, revision)).ok, true);

    const second = await service.saveSection(owner, "contact", { ...data, whatsappMessage: "Second" }, revision);
    assert.deepEqual(second, { ok: false, errors: { form: staleSectionMessage } });
    assert.equal((await service.getSection("contact")).whatsappMessage, "First");
  });

  it("says a save is stale before pointing out problems with it", async () => {
    const { service } = setUp();
    const { data, revision } = await service.getEditable(owner, "contact");
    await service.saveSection(owner, "contact", { ...data, whatsappMessage: "First" }, revision);
    const invalidAndStale = await service.saveSection(owner, "contact", { ...data, whatsappMessage: "" }, revision);
    assert.deepEqual(invalidAndStale, { ok: false, errors: { form: staleSectionMessage } });
  });

  it("refuses a save the store finds stale even when its own check passed, and records nothing", async () => {
    const store = createMemoryContentStore();
    const racing: ContentStore = { ...store, save: async () => ({ status: "stale" }) };
    const { service, audit } = setUp(racing);
    const { data, revision } = await service.getEditable(owner, "seo");
    assert.deepEqual(await service.saveSection(owner, "seo", data, revision), { ok: false, errors: { form: staleSectionMessage } });
    assert.deepEqual(audit.events, []);
  });

  it("refuses revisions that can't be real", async () => {
    const { service } = setUp();
    const { data } = await service.getEditable(owner, "seo");
    for (const revision of [-1, 1.5, Number.NaN]) {
      assert.deepEqual(await service.saveSection(owner, "seo", data, revision), { ok: false, errors: { form: reloadSectionMessage } });
    }
  });

  it("refuses a section it doesn't know", async () => {
    const { service } = setUp();
    assert.deepEqual(await service.saveSection(owner, "terms", { body: "x" }, 1), { ok: false, errors: { form: unknownSectionMessage } });
    assert.deepEqual(await service.saveSection(owner, "__proto__", {}, 1), { ok: false, errors: { form: unknownSectionMessage } });
  });

  it("refuses invalid content with problems keyed by dotted path, and saves nothing", async () => {
    const { service, audit } = setUp();
    const { data, revision } = await service.getEditable(owner, "site");
    const edited = { ...data, businessName: "", address: { ...data.address, city: "" } };
    const result = await service.saveSection(owner, "site", edited, revision);
    assert.deepEqual(result, {
      ok: false,
      errors: {
        businessName: "Enter the business name.",
        "address.city": "Enter the town or city, like Welkom.",
      },
    });
    assert.deepEqual(await service.getEditable(owner, "site"), { data, revision, recovered: false, savedAt: null });
    assert.deepEqual(audit.events, []);
  });

  it("replaces a stored section that no longer validates", async () => {
    const { service } = setUp(createMemoryContentStore([{ key: "seo", data: { pages: "broken" }, revision: 5 }]));
    const editable = await service.getEditable(owner, "seo");
    assert.equal(editable.recovered, true);
    assert.deepEqual(await service.saveSection(owner, "seo", editable.data, editable.revision), { ok: true, revision: 6 });
    assert.equal((await service.getEditable(owner, "seo")).recovered, false);
  });

  it("dates a changed privacy notice in the business's time zone", async () => {
    // 23:30 UTC on 11 Nov is already 12 Nov in Johannesburg.
    const { service } = setUp(createMemoryContentStore(), fixedClock("2026-11-11T23:30:00Z"));
    const { data, revision } = await service.getEditable(owner, "privacy");
    await service.saveSection(owner, "privacy", { ...data, body: `${data.body}\n\nWe keep enquiries for 90 days.` }, revision);
    const saved = await service.getSection("privacy");
    assert.equal(saved.version, "0.2");
    assert.equal(saved.updatedOn, "2026-11-12");
  });
});

describe("content service: the audit log", () => {
  it("records each save with the fields that changed, never their values", async () => {
    const { service, audit } = setUp();
    const contact = await service.getEditable(owner, "contact");
    await service.saveSection(owner, "contact", { ...contact.data, phone: "+27831112222", email: "new@example.com" }, contact.revision);
    const site = await service.getEditable(admin, "site");
    await service.saveSection(admin, "site", { ...site.data, address: { ...site.data.address, postalCode: "9459" } }, site.revision);

    assert.deepEqual(audit.events, [
      {
        actor: owner,
        category: "contact",
        action: "content.saved",
        target: { type: "content-section", id: "contact" },
        summary: "Saved Contact details (revision 2)",
        details: { revision: 2, changedFields: ["email", "phone"] },
      },
      {
        actor: admin,
        category: "content",
        action: "content.saved",
        target: { type: "content-section", id: "site" },
        summary: "Saved Business details (revision 2)",
        details: { revision: 2, changedFields: ["address.postalCode"] },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(audit.events), /\+27831112222|new@example\.com|9459/);
  });

  it("names changed fields by dotted path, lists as a whole, and says how many more past the limit", () => {
    assert.deepEqual(changedPaths({ a: 1, b: { c: 2, d: [1] } }, { a: 1, b: { c: 3, d: [1, 2] } }), ["b.c", "b.d"]);
    assert.deepEqual(changedPaths({ a: null }, { a: { b: 1 } }), ["a"]);
    assert.deepEqual(changedPaths({ x: 1 }, { x: 1 }), []);
    const many = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [`f${String(index).padStart(2, "0")}`, index]));
    const changed = changedPaths(many, Object.fromEntries(Object.entries(many).map(([key, value]) => [key, value + 1])));
    assert.equal(changed.length, 31);
    assert.equal(changed.at(-1), "…and 5 more");
  });
});

describe("content service: history", () => {
  it("lists every version of a section, newest first, with who saved it", async () => {
    const { service } = setUp(createMemoryContentStore(), fixedClock("2026-11-10T08:00:00Z"));
    const first = await service.getEditable(owner, "site");
    await service.saveSection(owner, "site", { ...first.data, description: "First." }, first.revision);
    const second = await service.getEditable(admin, "site");
    await service.saveSection(admin, "site", { ...second.data, description: "Second." }, second.revision);

    const saved = new Date("2026-11-10T08:00:00Z");
    assert.deepEqual(await service.listRevisions(owner, "site"), [
      { key: "site", revision: 3, savedAt: saved, savedBy: admin.id },
      { key: "site", revision: 2, savedAt: saved, savedBy: owner.id },
      { key: "site", revision: 1, savedAt: null, savedBy: null },
    ]);
  });

  it("shows an earlier version as today's site reads it, saying whether it's current", async () => {
    const { service } = setUp();
    const editable = await service.getEditable(owner, "site");
    await service.saveSection(owner, "site", { ...editable.data, description: "Changed." }, editable.revision);

    const original = await service.getRevision(owner, "site", 1);
    assert.equal(original?.data?.description, sampleContent().site.description);
    assert.equal(original?.current, false);
    assert.equal((await service.getRevision(owner, "site", 2))?.current, true);
    assert.equal(await service.getRevision(owner, "site", 9), null);
    assert.equal(await service.getRevision(owner, "site", 0), null);
  });

  it("restores an earlier version as a new revision, keeping the history, and records it", async () => {
    const { service, audit } = setUp();
    const editable = await service.getEditable(owner, "site");
    await service.saveSection(owner, "site", { ...editable.data, description: "A mistake." }, editable.revision);

    assert.deepEqual(await service.restoreRevision(admin, "site", 1, 2), { ok: true, revision: 3 });
    assert.equal((await service.getSection("site")).description, sampleContent().site.description);
    assert.deepEqual(
      (await service.listRevisions(owner, "site")).map((item) => item.revision),
      [3, 2, 1],
    );
    assert.deepEqual(audit.events.at(-1), {
      actor: admin,
      category: "content",
      action: "content.restored",
      target: { type: "content-section", id: "site" },
      summary: "Restored Business details to revision 1 (now revision 3)",
      details: { revision: 3, changedFields: ["description"], restoredFrom: 1 },
    });
  });

  it("refuses a restore over someone else's newer save, an unknown version, or one that no longer reads", async () => {
    const store = createMemoryContentStore();
    const { service } = setUp(store);
    const editable = await service.getEditable(owner, "site");
    await service.saveSection(owner, "site", { ...editable.data, description: "Newer." }, editable.revision);

    assert.deepEqual(await service.restoreRevision(owner, "site", 1, 1), { ok: false, errors: { form: staleSectionMessage } });
    assert.deepEqual(await service.restoreRevision(owner, "site", 7, 2), { ok: false, errors: { form: unknownRevisionMessage } });
    assert.deepEqual(await service.restoreRevision(owner, "terms", 1, 2), { ok: false, errors: { form: unknownSectionMessage } });
    assert.deepEqual(await service.restoreRevision(owner, "site", 1.5, 2), { ok: false, errors: { form: reloadSectionMessage } });

    // A version an older release saved in a shape that no longer validates can't come back.
    const unreadable: ContentStore = {
      ...store,
      loadRevision: async (key, revision) => ({ key, revision, data: { businessName: "" }, savedAt: null, savedBy: null }),
    };
    const { service: other } = setUp(unreadable);
    const current = await other.getEditable(owner, "site");
    assert.deepEqual(await other.restoreRevision(owner, "site", 1, current.revision), { ok: false, errors: { form: unreadableRevisionMessage } });
  });
});
