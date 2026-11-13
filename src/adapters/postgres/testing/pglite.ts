import { after, afterEach } from "node:test";
import type { PGliteInterface } from "@electric-sql/pglite";
import { openDatabase } from "../database";
import type { PostgresDriver } from "../driver";
import { migrate } from "../migrate";
import { migrations } from "../migrations/registry";
import { createPgliteDriver, openPglite } from "../pglite-driver";
import type { TestDatabases } from "./test-databases";

/**
 * Test databases on PGlite, in memory. Each test file makes two templates
 * once (an empty database and a migrated one) and every database a test asks
 * for is a clone of one: cloning takes a fraction of the time starting
 * PGlite does. Clones close after each test, templates after the file; an
 * open PGlite would keep the test process from exiting.
 */
export function pgliteTestDatabases(): TestDatabases {
  const templates = new Map<"empty" | "migrated", Promise<PGliteInterface>>();
  const clones: Promise<PGliteInterface>[] = [];

  const close = async (opening: Promise<PGliteInterface>) => {
    const pglite = await opening;
    if (!pglite.closed) await pglite.close();
  };

  afterEach(async () => {
    await Promise.allSettled(clones.splice(0).map(close));
  });

  after(async () => {
    await Promise.allSettled([...clones.splice(0), ...templates.values()].map(close));
  });

  const template = (kind: "empty" | "migrated"): Promise<PGliteInterface> => {
    let opening = templates.get(kind);
    if (!opening) {
      opening = openPglite().then(async (pglite) => {
        if (kind === "migrated") await migrate(createPgliteDriver(pglite), migrations);
        return pglite;
      });
      templates.set(kind, opening);
    }
    return opening;
  };

  const cloneOf = (kind: "empty" | "migrated"): PostgresDriver => {
    const clone = template(kind).then((pglite) => pglite.clone());
    clones.push(clone);
    return createPgliteDriver(clone);
  };

  return {
    label: "PGlite",
    concurrentTransactions: false,
    migrated: () => openDatabase(cloneOf("migrated"), { migrations }),
    empty: () => cloneOf("empty"),
  };
}
