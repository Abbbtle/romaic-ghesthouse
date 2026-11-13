import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pgliteTestDatabases } from "@/adapters/postgres/testing/pglite";
import { contentDefaults } from "@/content/defaults";
import { can, isPermission, NotAllowedError } from "@/lib/accounts/access";
import { sectionKeys, sectionPermissions } from "@/lib/content/schema";
import type { InvalidStoredSection } from "@/lib/content/service";
import type { Actor } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { createSiteContentService } from "./content";

const databases = pgliteTestDatabases();

const owner: Actor = { id: "00000000-0000-4000-8000-0000000000a1", role: "owner", name: "Owner" };
const admin: Actor = { id: "00000000-0000-4000-8000-0000000000a2", role: "admin", name: "Weberu" };
const sales: Actor = { id: "00000000-0000-4000-8000-0000000000a3", role: "sales", name: "Sales" };
const staff: Actor = { id: "00000000-0000-4000-8000-0000000000a4", role: "staff", name: "Staff" };

describe("content composition", () => {
  it("names only permissions the accounts core knows, and lets the roles edit what roles.md says", () => {
    // Neither core may import the other, so the composition layer checks they agree.
    for (const key of sectionKeys) assert.ok(isPermission(sectionPermissions[key]), key);
    const editableBy = (actor: Actor) => sectionKeys.filter((key) => can(actor, sectionPermissions[key]));
    assert.deepEqual(editableBy(owner), [...sectionKeys]);
    assert.deepEqual(
      editableBy(admin),
      sectionKeys.filter((key) => key !== "contact" && key !== "bookingTerms" && key !== "messages"),
      "the contact details and booking terms are the owner's alone",
    );
    assert.deepEqual(editableBy(sales), []);
    assert.deepEqual(editableBy(staff), []);
  });

  it("refuses an admin the owner's contact details with the accounts core's own refusal, and saves nothing", async () => {
    const db = databases.migrated();
    const audit = memoryAuditRecorder();
    const service = createSiteContentService(db, { audit });
    await assert.rejects(service.getEditable(admin, "contact"), NotAllowedError);
    await assert.rejects(service.saveSection(admin, "contact", { ...contentDefaults.contact, phone: "+27820000000" }, 1), NotAllowedError);
    await assert.rejects(service.restoreRevision(admin, "contact", 1, 1), NotAllowedError);
    for (const actor of [sales, staff]) await assert.rejects(service.getEditable(actor, "site"), NotAllowedError, actor.role);
    assert.equal((await service.getSection("contact")).phone, "+27769579928");
    assert.deepEqual(
      (await service.getSummaries(admin)).map(({ key }) => key),
      sectionKeys.filter((key) => key !== "contact" && key !== "bookingTerms" && key !== "messages"),
    );
    assert.deepEqual(audit.events, []);
  });

  it("serves Romaic's seed content before anyone edits it, storing each section once with its first revision", async () => {
    const db = databases.migrated();
    const audit = memoryAuditRecorder();
    assert.deepEqual(await createSiteContentService(db, { audit }).getAll(), contentDefaults);
    // A second server starting on the same database finds the sections already stored.
    assert.deepEqual(await createSiteContentService(db, { audit }).getAll(), contentDefaults);
    const rows = await db.all<{ key: string; revision: number }>("select key, revision from app.content_sections order by key");
    assert.deepEqual(
      rows,
      [...sectionKeys].sort().map((key) => ({ key, revision: 1 })),
    );
    const history = await db.all<{ key: string; revision: number }>("select key, revision from app.content_revisions order by key");
    assert.deepEqual(history, rows);
    assert.deepEqual(audit.events, [], "seeding isn't anyone's action");
  });

  it("keeps a save in the database, where every server reads it, and records it", async () => {
    const db = databases.migrated();
    const audit = memoryAuditRecorder();
    const editor = createSiteContentService(db, { audit });
    const { data, revision } = await editor.getEditable(owner, "site");
    const edited = { ...structuredClone(data), description: "Spacious rooms near the Welkom CBD." };
    assert.deepEqual(await editor.saveSection(owner, "site", edited, revision), { ok: true, revision: revision + 1 });

    const reader = createSiteContentService(db, { audit });
    assert.equal((await reader.getAll()).site.description, "Spacious rooms near the Welkom CBD.");
    assert.ok((await reader.getEditable(owner, "site")).savedAt instanceof Date);
    assert.deepEqual(
      audit.events.map((event) => [event.category, event.action, event.summary]),
      [["content", "content.saved", "Saved Business details (revision 2)"]],
    );
    assert.deepEqual(
      (await reader.listRevisions(owner, "site")).map((item) => item.revision),
      [2, 1],
    );
  });

  it("reports a stored section that no longer validates, and shows its default", async () => {
    const db = databases.migrated();
    const problems: InvalidStoredSection[] = [];
    const service = createSiteContentService(db, { onInvalidSection: (problem) => problems.push(problem), audit: memoryAuditRecorder() });
    await service.getAll();
    await db.run(`update app.content_sections set data = jsonb_set(data, '{businessName}', '""'), revision = 2 where key = 'site'`);
    assert.deepEqual((await service.getAll()).site, contentDefaults.site);
    assert.deepEqual(problems, [{ key: "site", revision: 2, errors: { businessName: "Enter the business name." } }]);
  });
});
