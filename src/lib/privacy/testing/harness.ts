import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds, type Clock } from "@/lib/kernel/ports";
import type { ContactVault, PrivacyAccess, PrivacyPermission } from "../ports";
import { createPrivacyService, type PrivacyServiceDependencies } from "../privacy-service";
import type { RecordKeeping } from "../retention";
import { createMemoryPrivacyStore, createMemoryRetention } from "./memory-stores";

/**
 * The privacy service over memory stores, for tests. Access is a stand-in
 * that lets only the owner through (the real matrix is tested in
 * src/server/privacy-access.test.ts, where the accounts core may be used).
 * The record-keeping period is a fixture in the shape of migration 340's
 * verified seed, not configuration: the app reads it from the database.
 */

export class TestNotAllowed extends Error {
  constructor(readonly permission: string) {
    super(`not allowed: ${permission}`);
  }
}

export const ownerOnly: PrivacyAccess = {
  can: (actor: Actor) => actor.role === "owner",
  assertCan(actor: Actor, permission: PrivacyPermission) {
    if (actor.role !== "owner") throw new TestNotAllowed(permission);
  },
};

export const actorWith = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role === "owner" ? "Nico" : role });

/** A vault that seals reversibly and refuses a value opened under another context, like the real one. */
export const testVault: ContactVault = {
  seal: (plaintext, context) => `sealed:${context}:${Buffer.from(plaintext, "utf8").toString("base64")}`,
  open(sealed, context) {
    const prefix = `sealed:${context}:`;
    if (!sealed.startsWith(prefix)) throw new Error("wrong context");
    return Buffer.from(sealed.slice(prefix.length), "base64").toString("utf8");
  },
};

/** SARS's period as migration 340 seeds it (verified, five years), as a fixture. */
export const verifiedKeeping = (years = 5): RecordKeeping => ({
  status: "verified",
  years,
  sourceUrl: "https://www.sars.gov.za/test-fixture/",
  sourceTitle: "Test fixture",
  checkedOn: "2026-11-12",
  note: "Test fixture.",
});

export const missingKeeping: RecordKeeping = { status: "missing", message: "Record-keeping period isn't verified for the test." };

export function privacyHarness({ clock = fixedClock("2026-11-13T08:00:00Z"), keeping = verifiedKeeping() }: { clock?: Clock; keeping?: RecordKeeping } = {}) {
  const store = createMemoryPrivacyStore();
  const world = createMemoryRetention();
  const audit = memoryAuditRecorder();
  const state = { keeping };
  const deps: PrivacyServiceDependencies = {
    store,
    retention: world.retention,
    guests: world.guests,
    vault: testVault,
    recordKeeping: async () => state.keeping,
    names: async () => ({ apartments: { "family-shower": "Family room with shower" }, units: { "00000000-0000-4000-8000-00000000a0a1": "Unit 1" } }),
    clock,
    ids: sequentialIds("privacy"),
    audit,
    access: ownerOnly,
    timeZone: "Africa/Johannesburg",
  };
  return { privacy: createPrivacyService(deps), store, audit, fixtures: world.fixtures, state, owner: actorWith("owner") };
}
