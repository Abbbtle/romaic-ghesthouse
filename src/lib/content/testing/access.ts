import type { Role } from "@/lib/kernel/actor";
import type { ContentAccess } from "../ports";
import type { SectionPermission } from "../schema";

/** What the test access check throws, standing in for the accounts core's NotAllowedError. */
export class TestNotAllowedError extends Error {
  constructor(readonly permission: SectionPermission) {
    super(`Not allowed: ${permission}`);
    this.name = "TestNotAllowedError";
  }
}

/**
 * Content permissions per role for the core's own tests, as roles.md grants
 * them. The core can't import the accounts core, so src/server/content.test.ts
 * checks the real matrix against the content service as well.
 */
const grants: Record<Role, readonly SectionPermission[]> = {
  owner: ["content:edit", "settings:contact", "settings:booking-rules"],
  admin: ["content:edit"],
  sales: [],
  staff: [],
};

export const testContentAccess: ContentAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};
