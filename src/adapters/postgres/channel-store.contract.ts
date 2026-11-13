import { describe, it } from "node:test";
import { channelStoreContract } from "@/lib/channels/testing/store-contract";
import { createPostgresChannelStore } from "./channel-store";
import { createPostgresInventoryStore } from "./inventory-store";
import type { TestDatabases } from "./testing/test-databases";

/**
 * What the Postgres channel store promises: the core's own contract, which
 * the memory store passes too. Run on PGlite by ./channel-store.test.ts and
 * on a real server by ./channel-store.pg.test.ts.
 */
export function describeChannelStoreContract(databases: TestDatabases): void {
  describe(`${databases.label}: channels`, () => {
    for (const { name, run } of channelStoreContract) {
      it(name, async () => {
        const db = databases.migrated();
        await run({ channels: createPostgresChannelStore(db), inventory: createPostgresInventoryStore(db) });
      });
    }
  });
}
