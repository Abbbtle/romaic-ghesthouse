import { describe, it } from "node:test";
import { bookkeepingHarness } from "./harness";
import { bankStoreContract, expenseStoreContract } from "./store-contract";

describe("memory expense store", () => {
  for (const { name, run } of expenseStoreContract) {
    it(name, async () => {
      const harness = bookkeepingHarness();
      await run(harness.expenseStore, harness.fixtures);
    });
  }
});

describe("memory bank store", () => {
  for (const { name, run } of bankStoreContract) {
    it(name, async () => {
      const harness = bookkeepingHarness();
      await run(harness.bankStore, harness.fixtures);
    });
  }
});
