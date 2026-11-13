import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import type { RateAccess, RatePermission } from "../ports";
import { createRateService, type RatedApartment } from "../rate-service";
import { createMemoryRateStore } from "./memory-store";

/** What the test access check throws, standing in for the accounts core's NotAllowedError. */
export class TestNotAllowedError extends Error {
  constructor(readonly permission: string) {
    super(`Not allowed: ${permission}`);
    this.name = "TestNotAllowedError";
  }
}

/** Rate permissions per role, as roles.md grants them. src/server tests check the real matrix too. */
const grants: Record<Role, readonly RatePermission[]> = {
  owner: ["rates:view", "rates:manage"],
  admin: [],
  sales: ["rates:view", "rates:manage"],
  staff: [],
};

export const testRateAccess: RateAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

export function testActor(role: Role): Actor {
  return { id: `00000000-0000-4000-8000-0000000000${{ owner: "a1", admin: "a2", sales: "a3", staff: "a4" }[role]}`, role, name: `Test ${role}` };
}

export const testRatedApartments: RatedApartment[] = [
  { slug: "family-shower", name: "Family room with shower", sleeps: 5 },
  { slug: "deluxe-double-bath", name: "Deluxe double room with bath", sleeps: 2 },
];

/** A rate service on a memory store, at 10:00 SAST on Thursday 12 November 2026. */
export function rateHarness() {
  const store = createMemoryRateStore();
  const audit = memoryAuditRecorder();
  const service = createRateService({
    store,
    apartmentTypes: async () => testRatedApartments.map((type) => ({ ...type })),
    clock: fixedClock("2026-11-12T08:00:00Z"),
    ids: sequentialIds("season"),
    audit,
    access: testRateAccess,
  });
  return { store, audit, service };
}
