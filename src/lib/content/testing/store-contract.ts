import type { ContentStore, SectionWrite } from "../ports";
import { sectionKeys } from "../schema";
import { sampleContent } from "./sample-content";

/**
 * What every ContentStore must do, as cases a test file runs against its own
 * store, each on a fresh, empty one:
 *
 *   for (const { name, run } of contentStoreContract) it(name, async () => run(await emptyStore()));
 *
 * The memory store runs it under `npm test`; the Postgres store runs it on
 * PGlite and on a real server, so the service can rely on the same
 * behaviour from either. Kept free of node:test so it stays a plain module
 * of the core.
 */
export type ContentStoreCase = { name: string; run: (store: ContentStore) => Promise<void> };

/** Account ids as the dashboard has them (UUIDs), for the people saving in these cases. */
const owner = "00000000-0000-4000-8000-0000000000a1";
const admin = "00000000-0000-4000-8000-0000000000a2";

const monday = new Date("2026-11-09T06:30:00.000Z");
const tuesday = new Date("2026-11-10T08:15:00.000Z");

/** A save over `expectedRevision`, by `savedBy` (the owner unless said otherwise) on Monday. */
function over(expectedRevision: number, savedBy = owner, savedAt = monday): SectionWrite {
  return { expectedRevision, savedBy, savedAt };
}

export const contentStoreContract: readonly ContentStoreCase[] = [
  {
    name: "starts with nothing stored",
    async run(store) {
      expectSame(await store.loadAll(), [], "loadAll");
      expectSame(await store.load("site"), null, "load");
      expectSame(await store.listRevisions("site", 10), [], "history");
    },
  },
  {
    name: "seeds every missing section at revision 1, saved by nobody, with that revision in its history",
    async run(store) {
      const defaults = sampleContent();
      await store.seedMissing(defaults);
      const stored = await store.loadAll();
      expectSame(stored.map((section) => section.key).sort(), [...sectionKeys].sort(), "seeded keys");
      for (const key of sectionKeys) {
        expectSame(await store.load(key), { key, data: defaults[key], revision: 1, savedAt: null }, `seeded ${key}`);
        expectSame(await store.listRevisions(key, 10), [{ key, revision: 1, savedAt: null, savedBy: null }], `${key} history`);
        expectSame(await store.loadRevision(key, 1), { key, revision: 1, data: defaults[key], savedAt: null, savedBy: null }, `${key} revision 1`);
      }
    },
  },
  {
    name: "never overwrites a stored section when seeding, even when run again",
    async run(store) {
      const edited = { ...sampleContent().site, description: "Edited" };
      expectSame(await store.save("site", edited, over(0)), { status: "saved", revision: 1 }, "first save");
      await store.seedMissing(sampleContent());
      await store.seedMissing(sampleContent());
      expectSame(await store.load("site"), { key: "site", data: edited, revision: 1, savedAt: monday }, "site after seeding");
      expectSame((await store.loadAll()).length, sectionKeys.length, "sections after seeding");
      expectSame(await store.listRevisions("site", 10), [{ key: "site", revision: 1, savedAt: monday, savedBy: owner }], "site history");
    },
  },
  {
    name: "saves over the current revision, moves it on by one and records when",
    async run(store) {
      await store.seedMissing(sampleContent());
      const edited = { ...sampleContent().seo, pages: { ...sampleContent().seo.pages, home: { title: "New title", description: "New description." } } };
      expectSame(await store.save("seo", edited, over(1, admin, tuesday)), { status: "saved", revision: 2 }, "save");
      expectSame(await store.load("seo"), { key: "seo", data: edited, revision: 2, savedAt: tuesday }, "after save");
      const others = (await store.loadAll()).filter((section) => section.key !== "seo");
      expectSame(
        others.map((section) => section.savedAt),
        others.map(() => null),
        "the other sections, still as seeded",
      );
    },
  },
  {
    name: "keeps every saved revision in the section's history, newest first",
    async run(store) {
      await store.seedMissing(sampleContent());
      const first = { ...sampleContent().site, description: "First" };
      const second = { ...sampleContent().site, description: "Second" };
      await store.save("site", first, over(1, owner, monday));
      await store.save("site", second, over(2, admin, tuesday));
      expectSame(
        await store.listRevisions("site", 10),
        [
          { key: "site", revision: 3, savedAt: tuesday, savedBy: admin },
          { key: "site", revision: 2, savedAt: monday, savedBy: owner },
          { key: "site", revision: 1, savedAt: null, savedBy: null },
        ],
        "history",
      );
      expectSame(await store.listRevisions("site", 2), [
        { key: "site", revision: 3, savedAt: tuesday, savedBy: admin },
        { key: "site", revision: 2, savedAt: monday, savedBy: owner },
      ], "limited history");
      expectSame(await store.loadRevision("site", 2), { key: "site", revision: 2, data: first, savedAt: monday, savedBy: owner }, "revision 2");
      expectSame(await store.loadRevision("site", 9), null, "a revision that doesn't exist");
      expectSame(await store.listRevisions("contact", 10), [{ key: "contact", revision: 1, savedAt: null, savedBy: null }], "another section's history");
    },
  },
  {
    name: "refuses a save over an older revision, keeping the newer content and no history for the refused one",
    async run(store) {
      await store.seedMissing(sampleContent());
      const first = { ...sampleContent().contact, whatsappMessage: "First" };
      const second = { ...sampleContent().contact, whatsappMessage: "Second" };
      expectSame(await store.save("contact", first, over(1)), { status: "saved", revision: 2 }, "first save");
      expectSame(await store.save("contact", second, over(1, admin, tuesday)), { status: "stale" }, "second save");
      expectSame(await store.save("contact", second, over(0, admin, tuesday)), { status: "stale" }, "save as new");
      expectSame(await store.load("contact"), { key: "contact", data: first, revision: 2, savedAt: monday }, "after both");
      expectSame(
        (await store.listRevisions("contact", 10)).map((revision) => revision.revision),
        [2, 1],
        "history",
      );
    },
  },
  {
    name: "lets only one of two saves over the same revision through, even at the same moment",
    async run(store) {
      await store.seedMissing(sampleContent());
      const first = { ...sampleContent().contact, whatsappMessage: "First" };
      const second = { ...sampleContent().contact, whatsappMessage: "Second" };
      const outcomes = await Promise.all([store.save("contact", first, over(1)), store.save("contact", second, over(1, admin, tuesday))]);
      expectSame(outcomes.map((outcome) => outcome.status).sort(), ["saved", "stale"], "outcomes");
      const kept = outcomes[0]?.status === "saved" ? { data: first, savedAt: monday } : { data: second, savedAt: tuesday };
      expectSame(await store.load("contact"), { key: "contact", ...kept, revision: 2 }, "after both");
      expectSame((await store.loadRevision("contact", 2))?.data, kept.data, "the history keeps the save that landed");
    },
  },
  {
    name: "seeds each section once when servers seed at the same moment",
    async run(store) {
      await Promise.all([store.seedMissing(sampleContent()), store.seedMissing(sampleContent())]);
      const stored = await store.loadAll();
      expectSame(stored.map((section) => section.key).sort(), [...sectionKeys].sort(), "seeded keys");
      expectSame(
        stored.map((section) => section.revision),
        sectionKeys.map(() => 1),
        "revisions",
      );
      for (const key of sectionKeys) expectSame((await store.listRevisions(key, 10)).length, 1, `${key} history`);
    },
  },
  {
    name: "keeps content exactly as saved",
    async run(store) {
      const site = sampleContent().site;
      const unusual = { ...site, description: "Ŝpacious — “warm” 🛏️\ttabbed", footerCredit: null };
      await store.save("site", unusual, over(0));
      expectSame(await store.load("site"), { key: "site", data: unusual, revision: 1, savedAt: monday }, "round trip");
      expectSame((await store.loadRevision("site", 1))?.data, unusual, "history round trip");
    },
  },
  {
    name: "hands out copies, so changing what it returns changes nothing stored",
    async run(store) {
      await store.save("contact", sampleContent().contact, over(0));
      const loaded = await store.load("contact");
      if (!loaded || typeof loaded.data !== "object" || loaded.data === null || !loaded.savedAt) throw new Error("load: nothing stored");
      (loaded.data as { whatsappMessage: string }).whatsappMessage = "Changed";
      loaded.savedAt.setUTCFullYear(1999);
      expectSame(await store.load("contact"), { key: "contact", data: sampleContent().contact, revision: 1, savedAt: monday }, "stored");
      const revision = await store.loadRevision("contact", 1);
      if (!revision || typeof revision.data !== "object" || revision.data === null) throw new Error("loadRevision: nothing stored");
      (revision.data as { whatsappMessage: string }).whatsappMessage = "Changed";
      expectSame((await store.loadRevision("contact", 1))?.data, sampleContent().contact, "stored revision");
    },
  },
];

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const [got, wanted] = [canonicalJson(actual), canonicalJson(expected)];
  if (got !== wanted) throw new Error(`${what}: expected ${wanted}, got ${got}`);
}

/** JSON with object keys sorted, since a store such as jsonb needn't keep their order. Dates become their ISO text. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}
