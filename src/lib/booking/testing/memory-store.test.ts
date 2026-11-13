import { describe, it } from "node:test";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { createMemoryBookingStore } from "./memory-store";
import { bookingStoreContract } from "./store-contract";

describe("memory booking store", () => {
  for (const { name, run } of bookingStoreContract) {
    it(name, async () => {
      const state = memoryInventoryState();
      await run({ requests: createMemoryBookingStore(state), inventory: createMemoryInventoryStore(state) });
    });
  }
});
