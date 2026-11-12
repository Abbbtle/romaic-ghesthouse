import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PGliteInterface, Transaction } from "@electric-sql/pglite";
import { deferredDriver, sessionTimeZone, type PostgresDriver, type SqlConnection } from "./driver";
import { typeParsers } from "./value-types";

/**
 * PGlite: Postgres compiled to WebAssembly, running inside this process. It
 * needs no setup, which suits development and tests; it isn't for
 * production, where many server instances share one database.
 *
 * It's imported when first opened, never before, so a server that talks to
 * Supabase through node-postgres never loads its 25 MB package.
 */

/** A PGlite in memory (each call a new, empty one) or kept in `dataDir`, created if it doesn't exist yet. */
export async function openPglite(dataDir?: string): Promise<PGliteInterface> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (!dataDir) return PGlite.create();
  mkdirSync(dataDir, { recursive: true });
  return PGlite.create({ dataDir });
}

type SharedInstance = { opening: Promise<PGliteInterface>; opened?: PGliteInterface };

const instancesKey = Symbol.for("romaic.pglite.instances");

/**
 * The PGlite kept in `dataDir`, opened once per process. Only one process
 * may open a directory at a time (stop `next dev` before running a script on
 * the same folder), and a second instance in the same process would corrupt
 * it too, so this keeps one per directory on globalThis, where development
 * reloads find it again.
 */
export function sharedPglite(dataDir: string): Promise<PGliteInterface> {
  const holder = globalThis as typeof globalThis & { [instancesKey]?: Map<string, SharedInstance> };
  const instances = (holder[instancesKey] ??= new Map<string, SharedInstance>());
  const directory = path.resolve(dataDir);
  const existing = instances.get(directory);
  // A closed instance can't be used again, so the next caller opens a fresh one.
  if (existing && !existing.opened?.closed) return existing.opening;
  const instance: SharedInstance = { opening: openPglite(directory) };
  instances.set(directory, instance);
  instance.opening.then(
    (pglite) => {
      instance.opened = pglite;
    },
    () => {
      // Opening failed: the next caller tries again.
      if (instances.get(directory) === instance) instances.delete(directory);
    },
  );
  return instance.opening;
}

/**
 * The driver for a PGlite, which may still be opening. Its one session is
 * set to UTC first (sessionTimeZone, as node-postgres sets each of its
 * connections): PGlite starts in the host's time zone (and a clone in it
 * again), and nothing should depend on where it runs.
 *
 * PGlite has one connection and runs a transaction's statements before
 * anyone else's, so transactions never overlap. Calling the PGlite itself
 * inside one of its transactions waits forever; ./database.ts refuses to.
 */
export function createPgliteDriver(pglite: PGliteInterface | Promise<PGliteInterface>): PostgresDriver {
  const connectionOf = (target: PGliteInterface | Transaction): SqlConnection => ({
    async query(text, values) {
      const result = await target.query(text, [...values], { parsers: typeParsers });
      return { rows: result.rows as never[], rowCount: result.rowCount ?? result.affectedRows ?? 0 };
    },
    async runScript(script) {
      await target.exec(script);
    },
  });

  const ready = Promise.resolve(pglite).then(async (database): Promise<PostgresDriver> => {
    await database.exec(`set time zone '${sessionTimeZone}'`);
    return {
      ...connectionOf(database),
      transaction: (work) => database.transaction((tx) => work(connectionOf(tx))),
      close: () => database.close(),
    };
  });
  return deferredDriver(ready);
}
