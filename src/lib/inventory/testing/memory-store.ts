import type { BlockAdd, InventoryStore, UnitAdd, UnitChange } from "../ports";
import { staysOverlap, type Stay } from "../stays";
import type { AvailabilityBlock, Unit } from "../units";

/**
 * Units and blocks in memory, for tests. It keeps the same rules the
 * Postgres store keeps (./store-contract.ts checks both). The booking
 * core's memory store shares its blocks (`state`), so accepting a request
 * and adding a block can't both take one night.
 */
export type MemoryInventoryState = { units: Map<string, Unit>; blocks: Map<string, AvailabilityBlock> };

export function memoryInventoryState(): MemoryInventoryState {
  return { units: new Map(), blocks: new Map() };
}

const copyUnit = (unit: Unit): Unit => ({ ...unit });
const copyBlock = (block: AvailabilityBlock): AvailabilityBlock => ({ ...block, stay: { ...block.stay }, createdAt: new Date(block.createdAt) });

/** Whether `block` can go in: its unit exists and is active, and no block on that unit shares a night. Shared with the booking core's memory store. */
export function memoryBlockOutcome(state: MemoryInventoryState, block: AvailabilityBlock): BlockAdd {
  const unit = state.units.get(block.unitId);
  if (!unit || !unit.active) return { status: "unit-unavailable" };
  const clash = [...state.blocks.values()].some((other) => other.unitId === block.unitId && staysOverlap(other.stay, block.stay));
  return clash ? { status: "overlaps" } : { status: "added" };
}

export function createMemoryInventoryStore(state: MemoryInventoryState = memoryInventoryState()): InventoryStore {
  const nameTaken = (name: string, except?: string) =>
    [...state.units.values()].some((unit) => unit.id !== except && unit.name.toLowerCase() === name.toLowerCase());

  return {
    async units() {
      return [...state.units.values()].map(copyUnit);
    },
    async unit(id) {
      const unit = state.units.get(id);
      return unit ? copyUnit(unit) : null;
    },
    async blocksOverlapping(range: Stay) {
      return [...state.blocks.values()].filter((block) => staysOverlap(block.stay, range)).map(copyBlock);
    },
    async block(id) {
      const block = state.blocks.get(id);
      return block ? copyBlock(block) : null;
    },
    async addUnit(unit, rules): Promise<UnitAdd> {
      if (nameTaken(unit.name)) return { status: "name-taken" };
      if (state.units.size >= rules.maxUnits) return { status: "too-many" };
      state.units.set(unit.id, copyUnit(unit));
      return { status: "added" };
    },
    async changeUnit(id, changes): Promise<UnitChange> {
      const unit = state.units.get(id);
      if (!unit) return { status: "missing" };
      if (nameTaken(changes.name, id)) return { status: "name-taken" };
      state.units.set(id, { ...unit, ...changes });
      return { status: "changed" };
    },
    async addBlock(block) {
      const outcome = memoryBlockOutcome(state, block);
      if (outcome.status === "added") state.blocks.set(block.id, copyBlock(block));
      return outcome;
    },
    async removeManualBlock(id) {
      const block = state.blocks.get(id);
      if (!block || block.reason === "request") return false;
      state.blocks.delete(id);
      return true;
    },
  };
}
