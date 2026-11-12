import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryAuditRecorder, type AuditCategory } from "@/lib/kernel/audit";
import { roles, type Actor, type Role } from "@/lib/kernel/actor";
import { createPrivateFileService, privateFileAuditCategories, privateFilePermissions, privateFilePurposes, type PrivateFileStore, type StoredPrivateFile } from "@/lib/media/private-files";
import { assertCan, can, dashboardAccess, financePermissions, isFinancePermission, NotAllowedError, permissions } from "@/lib/accounts/access";
import type { SignedIn } from "@/lib/accounts/account-service";
import { auditScopeFor, createAuditLogService } from "@/lib/accounts/audit-log-service";
import { createDashboardActionGuards } from "./admin-action-guards";
import { createTestGateway } from "@/adapters/payments/test-gateway";
import type { BookingForMoney } from "@/lib/money/money";
import { createMoneyService } from "@/lib/money/money-service";
import { createMemoryMoneyStore } from "@/lib/money/testing/memory-store";

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

describe("booking money (payments, receipts, invoices, refunds)", () => {
  const sales: Actor = { id: "00000000-0000-4000-8000-0000000000a4", role: "sales", name: "Sales" };
  const bookingId = "00000000-0000-4000-8000-00000000b001";
  const booking: BookingForMoney = {
    id: bookingId,
    ref: "RG-B2C3D",
    status: "confirmed",
    apartmentName: "Apartment",
    unitName: "Unit 1",
    stay: { arrive: "2026-12-10", leave: "2026-12-12" },
    adults: 2,
    children: 0,
    totalCents: 200_000,
    depositDueCents: 50_000,
    guest: { name: "A guest", phone: null, email: null },
  };

  function moneyFor() {
    const store = createMemoryMoneyStore();
    const audit = memoryAuditRecorder();
    let next = 0;
    const service = createMoneyService({
      store,
      bookings: { booking: async (id) => (id === bookingId ? booking : null) },
      gateway: createTestGateway({ secret: "a test secret that is long enough", clock }),
      sha256: () => "0".repeat(64),
      returnUrlFor: (id) => `https://example.com/admin/bookings/${id}/money`,
      clock,
      ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
      audit,
      access: { can, assertCan },
      timeZone: "Africa/Johannesburg",
    });
    return { service, store, audit };
  }

  const deposit = () => ({ kind: "deposit", method: "cash", amount: "500", receivedOn: "2026-01-01" });

  /** A received payment and an issued invoice, made by the owner, for the refusals to aim at. */
  async function createOwnedRecords(service: ReturnType<typeof createMoneyService>): Promise<{ paymentId: string; invoiceId: string }> {
    const recorded = await service.recordPayment(owner, bookingId, deposit());
    const issued = await service.issueInvoice(owner, bookingId, {});
    assert.ok(recorded.ok && issued.ok);
    const account = await service.account(owner, bookingId);
    return { paymentId: account?.payments[0]?.id ?? "", invoiceId: issued.id };
  }

  it("refuses admin and staff every money path, before reading or changing anything", async () => {
    for (const actor of [admin, staff]) {
      const { service, store, audit } = moneyFor();
      const owned = await createOwnedRecords(service);
      await assert.rejects(service.account(actor, bookingId), NotAllowedError);
      await assert.rejects(service.recordPayment(actor, bookingId, deposit()), NotAllowedError);
      await assert.rejects(service.recordPayment(actor, bookingId, { ...deposit(), kind: "refund" }), NotAllowedError);
      await assert.rejects(service.voidPayment(actor, bookingId, owned.paymentId, { reason: "x" }), NotAllowedError);
      await assert.rejects(service.invoicePreview(actor, bookingId), NotAllowedError);
      await assert.rejects(service.issueInvoice(actor, bookingId, {}), NotAllowedError);
      await assert.rejects(service.voidInvoice(actor, bookingId, owned.invoiceId, { reason: "x" }), NotAllowedError);
      await assert.rejects(service.invoiceDocument(actor, bookingId, owned.invoiceId), NotAllowedError);
      await assert.rejects(service.receiptDocument(actor, bookingId, owned.paymentId), NotAllowedError);
      await assert.rejects(service.createCheckout(actor, bookingId, { amount: "100" }), NotAllowedError);
      assert.equal((await store.payments(bookingId)).length, 1, `${actor.role} changed the payments`);
      assert.equal((await store.invoices(bookingId)).filter((invoice) => invoice.status === "issued").length, 1, `${actor.role} changed the invoices`);
      assert.equal(audit.events.filter((event) => event.actor?.id === actor.id).length, 0, `${actor.role} left an audit entry`);
    }
  });

  it("keeps admin and staff off the money page and its print pages", () => {
    for (const actor of [admin, staff]) {
      for (const permission of ["booking-money:manage", "refunds:issue"] as const) {
        assert.equal(dashboardAccess(signedIn(actor), { permission }, clock.now()).status, "not-allowed", `${actor.role} ${permission}`);
      }
    }
  });

  it("lets sales record payments and issue invoices, but not refund or void a refund", async () => {
    const { service, store } = moneyFor();
    assert.equal((await service.recordPayment(sales, bookingId, deposit())).ok, true);
    assert.equal((await service.issueInvoice(sales, bookingId, {})).ok, true);
    await assert.rejects(service.recordPayment(sales, bookingId, { ...deposit(), kind: "refund", amount: "100" }), NotAllowedError);
    assert.equal((await service.recordPayment(owner, bookingId, { ...deposit(), kind: "refund", amount: "100" })).ok, true);
    const refund = (await store.payments(bookingId)).find((payment) => payment.kind === "refund");
    await assert.rejects(service.voidPayment(sales, bookingId, refund?.id ?? "", { reason: "x" }), NotAllowedError);
    assert.equal((await service.account(sales, bookingId))?.canRefund, false);
    assert.equal((await service.account(owner, bookingId))?.canRefund, true);
  });
});

