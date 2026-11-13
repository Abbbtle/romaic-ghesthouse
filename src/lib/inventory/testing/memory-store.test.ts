import { describe, it } from "node:test";
import { createMemoryInventoryStore } from "./memory-store";
import { inventoryStoreContract } from "./store-contract";

describe("memory inventory store", () => {
  for (const { name, run } of inventoryStoreContract) {
    it(name, async () => run(createMemoryInventoryStore()));
  }
});
