import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createInventoryService, type ApartmentType } from "../inventory-service";
import type { InventoryAccess, InventoryPermission } from "../ports";
import { createMemoryInventoryStore, memoryInventoryState } from "./memory-store";

/** What the test access check throws, standing in for the accounts core's NotAllowedError. */
export class TestNotAllowedError extends Error {
  constructor(readonly permission: string) {
    super(`Not allowed: ${permission}`);
    this.name = "TestNotAllowedError";
  }
}

/** Inventory permissions per role, as roles.md grants them. src/server tests check the real matrix too. */
const grants: Record<Role, readonly InventoryPermission[]> = {
  owner: ["availability:view", "rates:manage"],
  admin: [],
  sales: ["availability:view", "rates:manage"],
  staff: [],
};

export const testInventoryAccess: InventoryAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

export function testActor(role: Role): Actor {
  return { id: `00000000-0000-4000-8000-0000000000${role === "owner" ? "a1" : role === "admin" ? "a2" : role === "sales" ? "a3" : "a4"}`, role, name: `Test ${role}` };
}

export const testApartmentTypes: ApartmentType[] = [
  { slug: "family-shower", name: "Family room with shower", sleeps: 5, published: true },
  { slug: "deluxe-double-bath", name: "Deluxe double room with bath", sleeps: 2, published: true },
  { slug: "hidden-suite", name: "Hidden suite", sleeps: 4, published: false },
];

/** An inventory service on memory stores, at 10:00 SAST on Thursday 12 November 2026. */
export function inventoryHarness(options: { now?: string; apartmentTypes?: ApartmentType[] } = {}) {
  const state = memoryInventoryState();
  const store = createMemoryInventoryStore(state);
  const audit = memoryAuditRecorder();
  let apartmentTypes = options.apartmentTypes ?? testApartmentTypes;
  const service = createInventoryService({
    store,
    apartmentTypes: async () => apartmentTypes.map((type) => ({ ...type })),
    clock: fixedClock(options.now ?? "2026-11-12T08:00:00Z"),
    ids: sequentialIds("00000000-0000-4000-8000-0000000c"),
    audit,
    access: testInventoryAccess,
    timeZone: "Africa/Johannesburg",
  });
  return {
    state,
    store,
    audit,
    service,
    setApartmentTypes(next: ApartmentType[]) {
      apartmentTypes = next;
    },
  };
}
