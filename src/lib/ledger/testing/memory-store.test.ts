import { describe, it } from "node:test";
import { createMemoryLedgerStore } from "./memory-store";
import { ledgerStoreContract } from "./store-contract";

describe("memory ledger store", () => {
  for (const { name, run } of ledgerStoreContract) {
    it(name, async () => run(createMemoryLedgerStore()));
  }
});
