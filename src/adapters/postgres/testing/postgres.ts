import { randomUUID } from "node:crypto";
import { after, afterEach, it } from "node:test";
import { openDatabase } from "../database";
import { deferredDriver, type PostgresDriver } from "../driver";
import { migrate } from "../migrate";
import { migrations } from "../migrations/registry";
import { createPgDriver, createPgPool } from "../pg-driver";
import type { TestDatabases } from "./test-databases";

/*
 * Test databases on a real Postgres server, where transactions really do run
 * side by side, so the tests of writes landing at the same moment prove the
 * locks. `npm run test:postgres` runs every *.pg.test.ts file with them.
 *
 * TEST_DATABASE_URL must be a direct connection (not a pooler) to a server
 * where the user may create databases. Each test gets a database of its own,
 * cloned from one migrated template per test file, and drops it when the
 * test ends; the template goes when the file is done. Names start with
 * romaic_test_, so leftovers from an interrupted run are easy to find.
 *
 * A throwaway local server (Postgres.app 18) outside the project and iCloud:
 *
 *   initdb -D <dir>/pgdata -U postgres --auth=trust
 *   pg_ctl -D <dir>/pgdata -o "-p 54329 -k '' -c fsync=off" -l <dir>/pgdata.log start
 *   createdb -h localhost -p 54329 -U postgres romaic_test
 *   TEST_DATABASE_URL=postgres://postgres@localhost:54329/romaic_test npm run test:postgres
 *
 * (-k '' turns off the Unix socket, whose path would be too long in most
 * scratch folders; everything connects over TCP.)
 */

/** The real-server test databases, or null, with a skipped test saying why, when TEST_DATABASE_URL isn't set. */
export function postgresTestDatabasesFromEnv(): TestDatabases | null {
  const url = process.env.TEST_DATABASE_URL;
  if (url) return postgresTestDatabases(url);
  it("runs against a real Postgres server", { skip: "set TEST_DATABASE_URL to run it (npm run test:postgres)" }, () => {});
  return null;
}

export function postgresTestDatabases(url: string): TestDatabases {
  const onConnectionError = (error: Error) => console.error("[test databases] A connection failed", error);
  const poolOn = (connectionString: string, maxConnections: number) =>
    createPgPool({ connectionString, maxConnections, caCertificate: null, attachToVercelFunctions: false, onConnectionError });
  const admin = createPgDriver(poolOn(url, 2));
  const urlOf = (database: string) => {
    const address = new URL(url);
    address.pathname = `/${database}`;
    return address.toString();
  };

  type Opened = { name: string; driver: PostgresDriver };
  const opened: Promise<Opened>[] = [];
  let template: Promise<string> | null = null;

  // Names are made here, never from input, so they're safe to put in the statement.
  const createDatabase = async (fromTemplate: string): Promise<string> => {
    const name = `romaic_test_${randomUUID().replaceAll("-", "")}`;
    await admin.runScript(`create database ${name} template ${fromTemplate}`);
    return name;
  };

  const dropDatabase = (name: string) => admin.runScript(`drop database if exists ${name} with (force)`);

  /** One migrated database per test file, which every migrated() database is a copy of. */
  const migratedTemplate = (): Promise<string> =>
    (template ??= (async () => {
      const name = await createDatabase("template0");
      const driver = createPgDriver(poolOn(urlOf(name), 1));
      try {
        await migrate(driver, migrations);
      } finally {
        // Postgres copies a database only while nobody is connected to it.
        await driver.close();
      }
      return name;
    })());

  const open = (fromTemplate: Promise<string>): PostgresDriver => {
    const ready = fromTemplate.then(createDatabase).then((name) => ({ name, driver: createPgDriver(poolOn(urlOf(name), 5)) }));
    opened.push(ready);
    return deferredDriver(ready.then(({ driver }) => driver));
  };

  const closeAndDrop = async (opening: Promise<Opened>) => {
    const { name, driver } = await opening;
    await driver.close();
    await dropDatabase(name);
  };

  afterEach(async () => {
    await Promise.allSettled(opened.splice(0).map(closeAndDrop));
  });

  after(async () => {
    await Promise.allSettled(opened.splice(0).map(closeAndDrop));
    if (template) await Promise.allSettled([template.then(dropDatabase)]);
    await admin.close();
  });

  return {
    label: "Postgres",
    concurrentTransactions: true,
    migrated: () => openDatabase(open(migratedTemplate()), { migrations }),
    empty: () => open(Promise.resolve("template0")),
  };
}
