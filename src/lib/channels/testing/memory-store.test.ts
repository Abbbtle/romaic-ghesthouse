import { describe, it } from "node:test";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { createMemoryChannelStore } from "./memory-store";
import { channelStoreContract } from "./store-contract";

describe("memory channel store", () => {
  for (const { name, run } of channelStoreContract) {
    it(name, async () => {
      const state = memoryInventoryState();
      await run({ channels: createMemoryChannelStore(state), inventory: createMemoryInventoryStore(state) });
    });
  }
});
