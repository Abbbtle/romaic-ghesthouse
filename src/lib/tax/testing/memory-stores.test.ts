import { describe, it } from "node:test";
import { createMemoryPayrollStore, createMemoryTaxStore } from "./memory-stores";
import { payrollStoreContract, taxStoreContract } from "./store-contract";

describe("memory tax store", () => {
  for (const { name, run } of taxStoreContract) {
    it(name, async () => run(createMemoryTaxStore(), { proofFileId: "00000000-0000-4000-8000-00000000f1f1" }));
  }
});

describe("memory payroll store", () => {
  for (const { name, run } of payrollStoreContract) {
    it(name, async () => run(createMemoryPayrollStore()));
  }
});
