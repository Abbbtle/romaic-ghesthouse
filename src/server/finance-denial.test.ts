import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryAuditRecorder, type AuditCategory } from "@/lib/kernel/audit";
import { roles, type Actor, type Role } from "@/lib/kernel/actor";
import { createPrivateFileService, privateFileAuditCategories, privateFilePermissions, privateFilePurposes, type PrivateFileStore, type StoredPrivateFile } from "@/lib/media/private-files";
import { assertCan, can, dashboardAccess, financePermissions, isFinancePermission, NotAllowedError, permissions } from "@/lib/accounts/access";
import type { SignedIn } from "@/lib/accounts/account-service";
import { auditScopeFor, createAuditLogService } from "@/lib/accounts/audit-log-service";
import { createDashboardActionGuards } from "./admin-action-guards";

/**
 * Admin (Weberu staff) never sees finance data anywhere (roles.md): no page,
 * action, route handler, export, file, search result, notification or
 * audit-log detail. This file checks each layer the dashboard has so far
 * with every finance permission (the navigation is checked in
 * src/components/admin/admin-routes.test.ts), and is where later phases add
 * their finance pages, route handlers, exports and searches.
 */

const admin: Actor = { id: "00000000-0000-4000-8000-0000000000a1", role: "admin", name: "Weberu admin" };
const staff: Actor = { id: "00000000-0000-4000-8000-0000000000a2", role: "staff", name: "Staff" };
const owner: Actor = { id: "00000000-0000-4000-8000-0000000000a3", role: "owner", name: "Nico" };

const signedIn = (actor: Actor): SignedIn => ({
  actor,
  email: `${actor.role}@example.com`,
  mfaDue: false,
  mustChangePassword: false,
  mfaEnrolmentDue: false,
  stepUpAt: new Date(),
  mfaEnabled: true,
  emailVerified: true,
  sessionHandle: "0000000000000000",
});

const clock = { now: () => new Date() };

const guardsFor = (actor: Actor) =>
  createDashboardActionGuards({ currentSignIn: async () => signedIn(actor), rethrowControlFlow: () => {}, reportError: () => {}, clock });

describe("admin and finance", () => {
  for (const permission of financePermissions) {
    describe(permission, () => {
      it("is refused by the permission check", () => {
        assert.equal(can(admin, permission), false);
      });

      it("keeps admin out of any page that needs it", () => {
        assert.deepEqual(dashboardAccess(signedIn(admin), { permission }, clock.now()), { status: "not-allowed", permission });
      });

      it("refuses admin's server actions that need it, without running them", async () => {
        let ran = false;
        const action = guardsFor(admin).dashboardAction(async () => {
          ran = true;
          return "secret figures";
        }, { permission, stepUp: true });
        const result = await action();
        assert.equal(ran, false);
        assert.equal((result as { status: string }).status, "failed");
        assert.equal(JSON.stringify(result).includes("secret figures"), false);
      });

      it("refuses admin's form actions that need it", async () => {
        let ran = false;
        const action = guardsFor(admin).dashboardFormAction(async () => {
          ran = true;
          return { status: "saved", message: "done" };
        }, { permission });
        const state = await action({ status: "idle" }, new FormData());
        assert.equal(ran, false);
        assert.equal(state.status, "failed");
      });
    });
  }

  it("never opens or takes a private file (receipt, proof of submission, task photo, ID document) for admin", async () => {
    const stored = new Map<string, StoredPrivateFile>();
    const store: PrivateFileStore = {
      async save(file) {
        stored.set(file.id, { ...file, byteSize: file.bytes.length, sha256: "x", createdBy: file.createdBy });
      },
      async find(id) {
        return stored.get(id) ?? null;
      },
    };
    let next = 0;
    const files = createPrivateFileService({ store, access: { can, assertCan }, ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` }, clock: { now: () => new Date() }, audit: memoryAuditRecorder() });
    const pdf = new TextEncoder().encode("%PDF-1.7 test");
    for (const purpose of privateFilePurposes) {
      const saved = await files.store(owner, { purpose, fileName: `${purpose}.pdf`, bytes: pdf });
      assert.ok(saved.ok, purpose);
      assert.equal(await files.open(admin, saved.id), null, `admin must never open a ${purpose}`);
      assert.equal(can(admin, privateFilePermissions[purpose]), false, purpose);
      await assert.rejects(files.store(admin, { purpose, fileName: "x.pdf", bytes: pdf }), NotAllowedError);
    }
  });

  it("filters money, bookings, guests, tax, periods and owners' security out of admin's audit log", async () => {
    const hidden: AuditCategory[] = ["money", "bookings", "guests", "tax", "periods", "auth", "security", "contact", "privacy", "channels"];
    for (const category of hidden) assert.equal(auditScopeFor(admin).categories.includes(category), false, category);
    const log = memoryAuditRecorder();
    for (const category of hidden) await log.record({ actor: owner, category, action: "test", summary: `R1,250 ${category}` });
    await log.record({ actor: owner, category: "team", action: "test", subjectRole: "sales", summary: "sales account" });
    await log.record({ actor: owner, category: "team", action: "test", subjectRole: "staff", summary: "staff account" });
    const service = createAuditLogService({ log });
    assert.deepEqual((await service.page(admin)).entries.map((entry) => entry.summary), ["staff account"], "changes to sales accounts stay with owners");
    await assert.rejects(service.verifyChain(admin), NotAllowedError);
    assert.equal((await service.page(owner)).entries.length, hidden.length + 2);
  });
});

describe("private files in the audit log", () => {
  it("records each kind of file where only those who may open it can read the entry", () => {
    for (const purpose of privateFilePurposes) {
      for (const role of roles) {
        const reader: Actor = { ...owner, role };
        if (auditScopeFor(reader).categories.includes(privateFileAuditCategories[purpose])) {
          assert.equal(can(reader, privateFilePermissions[purpose]), true, `${role} reads the log entry for a ${purpose} it can't open`);
        }
      }
    }
  });
});

describe("staff and finance", () => {
  it("holds no finance permission, opens no finance page and sees no audit log", () => {
    for (const permission of financePermissions) {
      assert.equal(can(staff, permission), false, permission);
      assert.equal(dashboardAccess(signedIn(staff), { permission }, clock.now()).status, "not-allowed");
    }
    assert.deepEqual(auditScopeFor(staff), { categories: [], subjectRoles: [] });
  });
});

describe("the finance list itself", () => {
  it("names only real permissions", () => {
    for (const permission of financePermissions) assert.ok((permissions as readonly string[]).includes(permission));
  });

  it("covers every permission no role but the owner holds, other than privacy and team administration", () => {
    const ownerOnly = permissions.filter((permission) => (["admin", "sales", "staff"] as Role[]).every((role) => !can({ role }, permission)));
    const notFinance = ownerOnly.filter((permission) => !isFinancePermission(permission));
    assert.deepEqual(notFinance.sort(), ["guests:export", "guests:id-numbers", "privacy:requests", "settings:booking-rules", "settings:contact", "team:manage-all"].sort());
  });
});
