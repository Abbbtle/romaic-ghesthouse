import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentStoreContract } from "@/lib/content/testing/store-contract";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { createPostgresContentStore } from "./content-store";
import type { TestDatabases } from "./testing/test-databases";

const owner = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-10T08:00:00.000Z");

/**
 * What the Postgres content store promises (src/lib/content/ports.ts): the
 * core's own contract, which every ContentStore passes, then what's
 * particular to Postgres. Run on PGlite by ./content-store.test.ts and on a
 * real server, where saves and seeding really do race, by
 * ./content-store.pg.test.ts.
 */
export function describeContentStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: content`, () => {
    for (const { name, run } of contentStoreContract) {
      it(name, async () => run(createPostgresContentStore(databases.migrated())));
    }

    it("records who saved a section, and nobody for a seeded one, in the section and its history", async () => {
      const db = databases.migrated();
      const store = createPostgresContentStore(db);
      await store.seedMissing(sampleContent());
      await store.save("contact", sampleContent().contact, { expectedRevision: 1, savedBy: owner, savedAt: at });
      const sections = await db.all<{ key: string; updated_by: string | null }>(
        "select key, updated_by from app.content_sections where key in ('contact', 'site') order by key",
      );
      assert.deepEqual(sections, [
        { key: "contact", updated_by: owner },
        { key: "site", updated_by: null },
      ]);
      const history = await db.all<{ key: string; revision: number; saved_by: string | null }>(
        "select key, revision, saved_by from app.content_revisions where key = 'contact' order by revision",
      );
      assert.deepEqual(history, [
        { key: "contact", revision: 1, saved_by: null },
        { key: "contact", revision: 2, saved_by: owner },
      ]);
    });

    it("stores text Postgres can't hold in jsonb with a replacement character, instead of failing the save", async () => {
      const store = createPostgresContentStore(databases.migrated());
      const contact = { ...sampleContent().contact, whatsappMessage: "Hello\u0000there" };
      assert.deepEqual(await store.save("contact", contact, { expectedRevision: 0, savedBy: owner, savedAt: at }), { status: "saved", revision: 1 });
      assert.equal(((await store.load("contact"))?.data as { whatsappMessage: string }).whatsappMessage, "Hello�there");
    });

    it("still reads a section this release doesn't know, which an older or newer one stored", async () => {
      const db = databases.migrated();
      await db.run("insert into app.content_sections (key, data, revision) values ('terms', '{\"body\": \"x\"}', 3)");
      assert.deepEqual(await createPostgresContentStore(db).loadAll(), [{ key: "terms", data: { body: "x" }, revision: 3, savedAt: null }]);
    });

    it("refuses anything but an object as a section's content or a revision's", async () => {
      const db = databases.migrated();
      await assert.rejects(db.run("insert into app.content_sections (key, data, revision) values ('site', '\"text\"', 1)"), /content_sections_data_is_object/);
      await assert.rejects(db.run("insert into app.content_revisions (key, revision, data) values ('site', 1, '[1]')"), /content_revisions_data_is_object/);
    });
  });
}
