import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roles, type Actor, type Role } from "@/lib/kernel/actor";
import {
  anySignedInRole,
  can,
  canManageRole,
  dashboardAccess,
  financePermissions,
  isFinancePermission,
  manageableRoles,
  mfaRequiredFor,
  permissions,
  permissionsOf,
  stepUpWindowMs,
  type Permission,
  type SignedInState,
} from "./access";

/**
 * The permission matrix as docs/planning/roles.md states it (decisions of
 * 2026-11-12 applied). Each line is a permission and the roles granted it.
 * Changing a grant means changing this table and roles.md together: every
 * role × permission pair below is checked.
 */
const expected: Record<Permission, readonly Role[]> = {
  "today:view": ["owner", "sales", "staff"],
  "stays:check-in-out": ["owner", "sales", "staff"],
  "rooms:status": ["owner", "sales", "staff"],
  "tasks:work": ["owner", "sales", "staff"],
  "tasks:manage": ["owner", "sales"],
  "availability:view": ["owner", "sales"],
  "bookings:view": ["owner", "sales"],
  "bookings:create": ["owner", "sales"],
  "bookings:change": ["owner", "sales"],
  "bookings:cancel": ["owner", "sales"],
  "quotes:manage": ["owner", "sales"],
  "guests:view": ["owner", "sales"],
  "guests:manage": ["owner", "sales"],
  "guests:export": ["owner"],
  "guests:id-numbers": ["owner"],
  "rates:view": ["owner", "sales"],
  "rates:manage": ["owner", "sales"],
  "promotions:manage": ["owner", "sales"],
  "channels:status": ["owner", "admin", "sales"],
  "channels:configure": ["owner", "admin"],
  "booking-money:manage": ["owner", "sales"],
  "refunds:issue": ["owner"],
  "reports:operations": ["owner", "sales"],
  "reports:revenue": ["owner"],
  "ledger:view": ["owner"],
  "ledger:post": ["owner"],
  "expenses:manage": ["owner"],
  "bank:manage": ["owner"],
  "tax:manage": ["owner"],
  "payroll:manage": ["owner"],
  "periods:lock": ["owner"],
  "finance:export": ["owner"],
  "content:edit": ["owner", "admin"],
  "media:manage": ["owner", "admin"],
  "settings:site": ["owner", "admin"],
  "settings:contact": ["owner"],
  "settings:booking-rules": ["owner"],
  "settings:payments": ["owner"],
  "integrations:configure": ["owner", "admin"],
  "team:view": ["owner", "admin"],
  "team:manage-operational": ["owner", "admin"],
  "team:manage-all": ["owner"],
  "audit:view": ["owner", "admin"],
  "audit:view-all": ["owner"],
  "privacy:requests": ["owner"],
};

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-00000000000${roles.indexOf(role) + 1}`, role, name: role });

const signedIn = (role: Role, overrides: Partial<SignedInState> = {}): SignedInState => ({
  actor: actor(role),
  mfaDue: false,
  mustChangePassword: false,
  mfaEnrolmentDue: false,
  stepUpAt: null,
  ...overrides,
});

describe("the permission matrix", () => {
  it("covers every permission in the catalogue, and nothing outside it", () => {
    assert.deepEqual(Object.keys(expected).sort(), [...permissions].sort());
  });

  for (const role of roles) {
    describe(role, () => {
      for (const permission of permissions) {
        const granted = expected[permission].includes(role);
        it(`${granted ? "is granted" : "is refused"} ${permission}`, () => {
          assert.equal(can({ role }, permission), granted);
          assert.equal(permissionsOf(role).includes(permission), granted);
        });
      }
    });
  }

  it("grants the owner everything", () => {
    assert.deepEqual(permissionsOf("owner"), [...permissions]);
  });

  it("refuses unknown permissions to everyone: deny by default", () => {
    for (const role of roles) assert.equal(can({ role }, "ledger:delete" as Permission), false);
  });
});

describe("finance data", () => {
  it("is held only by the owner, except the booking money sales works with", () => {
    for (const permission of financePermissions) {
      assert.equal(can({ role: "owner" }, permission), true, permission);
      assert.equal(can({ role: "admin" }, permission), false, `admin must never hold ${permission}`);
      assert.equal(can({ role: "staff" }, permission), false, `staff must never hold ${permission}`);
    }
    const salesFinance = financePermissions.filter((permission) => can({ role: "sales" }, permission));
    assert.deepEqual(salesFinance.sort(), ["booking-money:manage", "bookings:view", "quotes:manage"]);
  });

  it("names payment settings, the ledger, tax and payroll as finance permissions", () => {
    for (const permission of ["settings:payments", "ledger:view", "tax:manage", "payroll:manage", "periods:lock", "finance:export"] as const) {
      assert.equal(isFinancePermission(permission), true, permission);
    }
    assert.equal(isFinancePermission("content:edit"), false);
  });
});

describe("authenticators", () => {
  it("are required for owner, admin and sales, and optional for staff", () => {
    assert.deepEqual(
      roles.filter((role) => mfaRequiredFor(role)),
      ["owner", "admin", "sales"],
    );
  });
});

describe("who may manage whom", () => {
  it("lets owners manage every role and admins only staff (decision R1)", () => {
    assert.deepEqual(manageableRoles({ role: "owner" }), ["owner", "admin", "sales", "staff"]);
    assert.deepEqual(manageableRoles({ role: "admin" }), ["staff"]);
    assert.deepEqual(manageableRoles({ role: "sales" }), []);
    assert.deepEqual(manageableRoles({ role: "staff" }), []);
  });

  it("never lets an admin manage an owner, an admin or a sales account", () => {
    for (const role of ["owner", "admin", "sales"] as const) assert.equal(canManageRole({ role: "admin" }, role), false, role);
    assert.equal(canManageRole({ role: "admin" }, "staff"), true);
  });
});

describe("dashboardAccess", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");

  it("turns away someone signed out", () => {
    assert.deepEqual(dashboardAccess(null, anySignedInRole, now), { status: "signed-out" });
    assert.deepEqual(dashboardAccess(null, { permission: "content:edit" }, now), { status: "signed-out" });
  });

  it("asks for the authenticator code first, then a new password, then authenticator set-up", () => {
    assert.deepEqual(dashboardAccess(signedIn("owner", { mfaDue: true, mustChangePassword: true }), anySignedInRole, now), { status: "sign-in-unfinished", step: "mfa" });
    assert.deepEqual(dashboardAccess(signedIn("owner", { mustChangePassword: true, mfaEnrolmentDue: true }), anySignedInRole, now), {
      status: "sign-in-unfinished",
      step: "change-password",
    });
    assert.deepEqual(dashboardAccess(signedIn("owner", { mfaEnrolmentDue: true }), anySignedInRole, now), { status: "sign-in-unfinished", step: "mfa-setup" });
  });

  it("lets every role into a part that asks for no permission, once signing in is done", () => {
    for (const role of roles) assert.equal(dashboardAccess(signedIn(role), anySignedInRole, now).status, "allowed", role);
  });

  it("refuses a page whose permission the role lacks, naming the permission", () => {
    assert.deepEqual(dashboardAccess(signedIn("admin"), { permission: "ledger:view" }, now), { status: "not-allowed", permission: "ledger:view" });
    assert.deepEqual(dashboardAccess(signedIn("staff"), { permission: "bookings:view" }, now), { status: "not-allowed", permission: "bookings:view" });
    assert.equal(dashboardAccess(signedIn("owner"), { permission: "ledger:view" }, now).status, "allowed");
  });

  it("asks for the password and code again unless they were given in the last 15 minutes", () => {
    const recent = new Date(now.getTime() - stepUpWindowMs + 1000);
    const stale = new Date(now.getTime() - stepUpWindowMs);
    const stepUp = { ...anySignedInRole, stepUp: true };
    assert.deepEqual(dashboardAccess(signedIn("owner"), { permission: "team:manage-all", stepUp: true }, now), { status: "step-up-due" });
    assert.deepEqual(dashboardAccess(signedIn("owner", { stepUpAt: stale }), stepUp, now), { status: "step-up-due" });
    assert.equal(dashboardAccess(signedIn("owner", { stepUpAt: recent }), stepUp, now).status, "allowed");
  });

  it("checks the permission before step-up, so a confirmation never opens a page the role can't use", () => {
    assert.deepEqual(dashboardAccess(signedIn("admin", { stepUpAt: now }), { permission: "tax:manage", stepUp: true }, now), {
      status: "not-allowed",
      permission: "tax:manage",
    });
  });
});
