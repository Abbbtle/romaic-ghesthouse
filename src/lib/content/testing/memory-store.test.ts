import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemoryContentStore } from "./memory-store";
import { contentStoreContract } from "./store-contract";

describe("memory content store", () => {
  for (const { name, run } of contentStoreContract) {
    it(name, async () => run(createMemoryContentStore()));
  }

  it("can start with sections an older release saved, which have no history", async () => {
    const store = createMemoryContentStore([{ key: "retired", data: { old: true }, revision: 4 }]);
    assert.deepEqual(await store.loadAll(), [{ key: "retired", data: { old: true }, revision: 4, savedAt: null }]);
    assert.deepEqual(await store.listRevisions("site", 10), []);
  });
});
