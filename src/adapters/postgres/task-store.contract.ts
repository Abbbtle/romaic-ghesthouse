import { describe, it } from "node:test";
import { taskStoreContract } from "@/lib/tasks/testing/store-contract";
import { createPostgresInventoryStore } from "./inventory-store";
import { createPostgresReservationStore } from "./reservation-store";
import { createPostgresTaskStore } from "./task-store";
import type { TestDatabases } from "./testing/test-databases";

/** The task store's contract on Postgres: run on PGlite by ./task-store.test.ts and on a real server by ./task-store.pg.test.ts. */
export function describeTaskStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: tasks`, () => {
    for (const { name, run } of taskStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run({ tasks: createPostgresTaskStore(db), inventory: createPostgresInventoryStore(db), reservations: createPostgresReservationStore(db) });
      });
    }
  });
}
