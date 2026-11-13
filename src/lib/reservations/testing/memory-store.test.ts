import { describe, it } from "node:test";
import { createMemoryBookingStore } from "@/lib/booking/testing/memory-store";
import { createMemoryInventoryStore } from "@/lib/inventory/testing/memory-store";
import { createMemoryReservationStore, memoryReservationState } from "./memory-store";
import { reservationStoreContract } from "./store-contract";

describe("memory reservation store", () => {
  for (const { name, run } of reservationStoreContract) {
    it(name, async () => {
      const state = memoryReservationState();
      await run({
        reservations: createMemoryReservationStore(state),
        requests: createMemoryBookingStore(state.inventory, state.requests),
        inventory: createMemoryInventoryStore(state.inventory),
        async seedChannelStay(stay, block) {
          state.channelStays.set(stay.id, stay);
          if (block) state.inventory.blocks.set(block.id, block);
        },
      });
    });
  }
});
