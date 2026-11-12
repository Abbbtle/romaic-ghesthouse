import type { Actor } from "@/lib/kernel/actor";
import type { Stay } from "./stays";
import type { AvailabilityBlock, Unit } from "./units";

/**
 * What the inventory needs from the outside world. Adapters implement these
 * (Postgres; in-memory for tests, src/lib/inventory/testing); src/server
 * wires them in.
 *
 * Every write is one atomic command and the store guards its own rules at
 * write time (someone else may act between a read and a write). Refusals
 * come back as values, never as thrown errors.
 */

export type UnitAdd = { status: "added" } | { status: "name-taken" } | { status: "too-many" };

export type UnitChange = { status: "changed" } | { status: "missing" } | { status: "name-taken" };

export type BlockAdd =
  | { status: "added" }
  /** The unit already has a block on one of these nights. */
  | { status: "overlaps" }
  /** The unit doesn't exist, or is inactive. */
  | { status: "unit-unavailable" };

export interface InventoryStore {
  /** Every unit, active or not. */
  units(): Promise<Unit[]>;
  unit(id: string): Promise<Unit | null>;
  /** Blocks with at least one night inside `range`. */
  blocksOverlapping(range: Stay): Promise<AvailabilityBlock[]>;
  block(id: string): Promise<AvailabilityBlock | null>;
  /** Adds a unit; names are unique (ignoring case) and there are at most `maxUnits`. */
  addUnit(unit: Unit, rules: { maxUnits: number }): Promise<UnitAdd>;
  /** Renames a unit, moves it to another apartment type, or turns it on or off. */
  changeUnit(id: string, changes: Pick<Unit, "name" | "apartment" | "active">): Promise<UnitChange>;
  /** Adds a block, unless the unit is missing or inactive, or already blocked on one of its nights. */
  addBlock(block: AvailabilityBlock): Promise<BlockAdd>;
  /** Removes a block that isn't a booking request's; false when there's no such block. Request blocks go with their request's decision. */
  removeManualBlock(id: string): Promise<boolean>;
}

/**
 * Permission checks, from the accounts core (wired in src/server). The
 * inventory can't import it, so it names the permissions it needs.
 */
export type InventoryPermission = "availability:view" | "rates:manage";

export interface InventoryAccess {
  can(actor: Actor, permission: InventoryPermission): boolean;
  assertCan(actor: Actor, permission: InventoryPermission): void;
}
