import { describe, it } from "node:test";
import { createMemoryPrivacyStore, createMemoryRetention } from "./memory-stores";
import { privacyStoreContract, retentionStoreContract } from "./store-contract";

describe("memory privacy store", () => {
  for (const { name, run } of privacyStoreContract) {
    it(name, async () => run(createMemoryPrivacyStore()));
  }
});

describe("memory retention store", () => {
  for (const { name, run } of retentionStoreContract) {
    it(name, async () => run(createMemoryRetention()));
  }
});
