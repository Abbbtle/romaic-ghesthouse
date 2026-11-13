import { describe, it } from "node:test";
import { createMemoryInventoryStore } from "@/lib/inventory/testing/memory-store";
import { createMemoryReservationStore, memoryReservationState } from "@/lib/reservations/testing/memory-store";
import { createMemoryTaskStore } from "./memory-store";
import { taskStoreContract } from "./store-contract";

describe("memory task store", () => {
  for (const { name, run } of taskStoreContract) {
    it(name, async () => {
      const state = memoryReservationState();
      await run({ tasks: createMemoryTaskStore(state.inventory), inventory: createMemoryInventoryStore(state.inventory), reservations: createMemoryReservationStore(state) });
    });
  }
});
