import { describe, it } from "node:test";
import { createMemoryMoneyStore } from "./memory-store";
import { moneyStoreContract } from "./store-contract";

describe("memory money store", () => {
  for (const { name, run } of moneyStoreContract) {
    it(name, async () => run(createMemoryMoneyStore(), "00000000-0000-4000-8000-00000000d001"));
  }
});
