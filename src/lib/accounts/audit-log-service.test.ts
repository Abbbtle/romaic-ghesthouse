import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditCategories, memoryAuditRecorder, moreSenior, type AuditCategory } from "@/lib/kernel/audit";
import type { Actor, Role } from "@/lib/kernel/actor";
import { NotAllowedError } from "./access";
import { auditPageSize, auditScopeFor, createAuditLogService, parseBeforeSeq } from "./audit-log-service";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-00000000000${role.length}`, role, name: role });

describe("who reads which audit entries", () => {
  it("gives the owner every category and entries about every role", () => {
    assert.deepEqual(auditScopeFor({ role: "owner" }), { categories: [...auditCategories], subjectRoles: ["owner", "admin", "sales", "staff"] });
  });

  it("gives admins the parts of the business they look after, and entries about staff accounts only", () => {
    assert.deepEqual(auditScopeFor({ role: "admin" }), { categories: ["team", "content", "media", "settings", "integrations"], subjectRoles: ["staff"] });
  });

  it("gives sales and staff nothing", () => {
    assert.deepEqual(auditScopeFor({ role: "sales" }), { categories: [], subjectRoles: [] });
    assert.deepEqual(auditScopeFor({ role: "staff" }), { categories: [], subjectRoles: [] });
  });

  it("records a change between two roles under the more senior one", () => {
    assert.equal(moreSenior("staff", "admin"), "admin");
    assert.equal(moreSenior("owner", "staff"), "owner");
    assert.equal(moreSenior("staff", "staff"), "staff");
  });
});

describe("the audit log service", () => {
  it("pages through what the reader may see, with no page thinned out by entries they can't", async () => {
    const log = memoryAuditRecorder();
    // Interleave entries an admin may see with ones they may not, more than a page of each.
    for (let n = 0; n < auditPageSize + 5; n++) {
      await log.record({ actor: null, category: "content", action: "test", summary: `content ${n}` });
      await log.record({ actor: null, category: "money", action: "test", summary: `money ${n}` });
      await log.record({ actor: null, category: "team", action: "test", subjectRole: "sales", summary: `sales account ${n}` });
    }
    const service = createAuditLogService({ log });
    const first = await service.page(actor("admin"));
    assert.equal(first.entries.length, auditPageSize);
    assert.ok(first.entries.every((entry) => entry.category === "content"));
    assert.notEqual(first.olderBeforeSeq, null);
    const second = await service.page(actor("admin"), first.olderBeforeSeq ?? undefined);
    assert.equal(second.entries.length, 5);
    assert.equal(second.olderBeforeSeq, null);
    assert.equal(second.entries.at(-1)?.summary, "content 0");
  });

  it("shows admins team changes to staff accounts, and not to anyone else's", async () => {
    const log = memoryAuditRecorder();
    for (const role of ["owner", "admin", "sales", "staff"] as const) {
      await log.record({ actor: null, category: "team", action: "team.password-reset", subjectRole: role, summary: role });
    }
    const service = createAuditLogService({ log });
    assert.deepEqual((await service.page(actor("admin"))).entries.map((entry) => entry.summary), ["staff"]);
    assert.equal((await service.page(actor("owner"))).entries.length, 4);
  });

  it("never shows admins an entry in a category outside their permissions", async () => {
    const log = memoryAuditRecorder();
    const hidden: AuditCategory[] = ["auth", "contact", "security", "bookings", "guests", "money", "channels", "tax", "periods", "privacy"];
    for (const category of hidden) await log.record({ actor: null, category, action: "test", summary: category });
    assert.deepEqual((await createAuditLogService({ log }).page(actor("admin"))).entries, []);
  });

  it("refuses roles without audit:view, and the chain check to anyone but the owner", async () => {
    const service = createAuditLogService({ log: memoryAuditRecorder() });
    await assert.rejects(service.page(actor("sales")), NotAllowedError);
    await assert.rejects(service.page(actor("staff")), NotAllowedError);
    await assert.rejects(service.verifyChain(actor("admin")), NotAllowedError);
    assert.equal((await service.verifyChain(actor("owner"))).status, "intact");
  });

  it("reads the page to start from out of the address, ignoring anything that isn't a positive whole number", () => {
    assert.equal(parseBeforeSeq("42"), 42);
    assert.equal(parseBeforeSeq(["7", "9"]), 7);
    for (const value of [undefined, "", "0", "-3", "1.5", "abc", "9".repeat(30)]) assert.equal(parseBeforeSeq(value), undefined, String(value));
  });
});
