import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { assertCan, can, NotAllowedError } from "@/lib/accounts/access";
import { auditScopeFor } from "@/lib/accounts/audit-log-service";
import type { Actor, Role } from "@/lib/kernel/actor";
import { inAuditScope, memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock, sequentialIds } from "@/lib/kernel/ports";
import { createPrivacyService } from "@/lib/privacy/privacy-service";
import { testVault, verifiedKeeping } from "@/lib/privacy/testing/harness";
import { createMemoryPrivacyStore, createMemoryRetention } from "@/lib/privacy/testing/memory-stores";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

function service() {
  const audit = memoryAuditRecorder();
  const world = createMemoryRetention();
  const privacy = createPrivacyService({
    store: createMemoryPrivacyStore(),
    retention: world.retention,
    guests: world.guests,
    vault: testVault,
    recordKeeping: async () => verifiedKeeping(),
    names: async () => ({ apartments: {}, units: {} }),
    clock: fixedClock("2026-11-13T08:00:00Z"),
    ids: sequentialIds("privacy"),
    audit,
    access: { can, assertCan },
    timeZone: "Africa/Johannesburg",
  });
  return { privacy, audit, fixtures: world.fixtures };
}

const request = { kind: "access", requesterName: "Thandi Mokoena", contact: "thandi@example.com", receivedOn: "2026-11-10", dueOn: "2026-12-10" };
const breach = { discoveredOn: "2026-11-12", summary: "A laptop was stolen.", dataInvolved: "Guests' names.", status: "ongoing" };

describe("privacy with the real permission matrix (roles.md)", () => {
  it("is the owner's alone: privacy:requests belongs to no other role", () => {
    assert.deepEqual(
      (["owner", "admin", "sales", "staff"] as const).filter((role) => can({ role }, "privacy:requests")),
      ["owner"],
    );
  });

  it("lets the owner log requests, record breaches, set the officer and confirm retention", async () => {
    const { privacy } = service();
    const owner = actor("owner");
    assert.ok((await privacy.logRequest(owner, request)).ok);
    assert.ok((await privacy.recordBreach(owner, breach)).ok);
    assert.deepEqual(await privacy.saveOfficer(owner, { name: "Nico Pretorius", email: "privacy@example.com" }), { ok: true });
    assert.deepEqual(await privacy.confirmPolicy(owner, "audit-log"), { ok: true });
    assert.equal((await privacy.overview(owner)).requests.open, 1);
  });

  it("refuses admin (Weberu), sales and staff every privacy method, recording nothing", async () => {
    const { privacy, audit, fixtures } = service();
    await fixtures.addGuest({ id: "guest-1", name: "Thandi Mokoena", phone: "+27821234567", email: null, notes: null, createdAt: new Date("2026-01-01T08:00:00Z") }, []);
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actor(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["overview", () => privacy.overview(who)],
        ["officer", () => privacy.officer(who)],
        ["saveOfficer", () => privacy.saveOfficer(who, { name: "X Y", email: "x@example.com" })],
        ["requests", () => privacy.requests(who)],
        ["request", () => privacy.request(who, "x")],
        ["logRequest", () => privacy.logRequest(who, request)],
        ["changeRequest", () => privacy.changeRequest(who, "x", {})],
        ["startRequest", () => privacy.startRequest(who, "x", {})],
        ["answerRequest", () => privacy.answerRequest(who, "x", {})],
        ["refuseRequest", () => privacy.refuseRequest(who, "x", {})],
        ["confirmIdentity", () => privacy.confirmIdentity(who, "x", {})],
        ["linkGuest", () => privacy.linkGuest(who, "x", "guest-1")],
        ["unlinkGuest", () => privacy.unlinkGuest(who, "x")],
        ["revealContact", () => privacy.revealContact(who, "x")],
        ["searchGuests", () => privacy.searchGuests(who, "Thandi")],
        ["guestRecord", () => privacy.guestRecord(who, "guest-1")],
        ["exportGuest", () => privacy.exportGuest(who, "guest-1")],
        ["anonymiseGuest", () => privacy.anonymiseGuest(who, "guest-1", { confirmName: "Thandi Mokoena" })],
        ["breaches", () => privacy.breaches(who)],
        ["breach", () => privacy.breach(who, "x")],
        ["recordBreach", () => privacy.recordBreach(who, breach)],
        ["changeBreach", () => privacy.changeBreach(who, "x", {})],
        ["retention", () => privacy.retention(who)],
        ["setPolicy", () => privacy.setPolicy(who, "task-photos", { period: "6" })],
        ["confirmPolicy", () => privacy.confirmPolicy(who, "audit-log")],
      ];
      for (const [name, call] of calls) {
        await assert.rejects(call(), (error: unknown) => error instanceof NotAllowedError && error.permission === "privacy:requests", `${role}: ${name}`);
      }
    }
    assert.equal(audit.events.length, 0, "nothing was recorded");
    assert.equal((await fixtures.guest("guest-1"))?.anonymised, false);
  });

  describe("the Privacy pages, actions and download", () => {
    // Read from the source: every entry point under /admin/privacy must name privacy:requests, so only the owner gets in.
    const root = "src/app/admin/(dashboard)/privacy";
    const files = readdirSync(root, { recursive: true })
      .map((entry) => join(root, String(entry)))
      .filter((path) => statSync(path).isFile());

    it("guards every page with privacy:requests", () => {
      const pages = files.filter((path) => path.endsWith("page.tsx"));
      assert.ok(pages.length >= 9, `found ${pages.length} pages`);
      for (const path of pages) {
        const named = [...readFileSync(path, "utf8").matchAll(/requireDashboardActor\(\{ permission: "([a-z:-]+)"/g)].map((match) => match[1]);
        assert.deepEqual(named, ["privacy:requests"], path);
      }
    });

    it("guards every server action with privacy:requests, and asks for a recent step-up to open a contact, anonymise or change a rule", () => {
      const source = readFileSync(join(root, "actions.ts"), "utf8");
      const guards = new Map([...source.matchAll(/const (\w+) = \{ permission: "([a-z:-]+)"([^}]*)\}/g)].map((match) => [match[1]!, { permission: match[2]!, rest: match[3]! }]));
      for (const guard of guards.values()) assert.equal(guard.permission, "privacy:requests");
      const actions = [...source.matchAll(/export const (\w+) = dashboard(?:Form)?Action\(/g)].map((match) => match[1]!);
      const endings = [...source.matchAll(/^\}, (\w+)\);$/gm)].map((match) => match[1]!);
      assert.equal(endings.length, actions.length, "every action ends with a guard");
      assert.ok(endings.every((name) => guards.has(name)));
      const stepped = actions.filter((_, index) => /stepUp: true/.test(guards.get(endings[index]!)!.rest));
      assert.deepEqual(stepped.sort(), ["anonymiseGuest", "confirmRetentionRule", "revealContact", "setRetentionPeriod"]);
    });

    it("asks for privacy:requests with a recent step-up before a guest's export downloads", () => {
      const route = readFileSync(join(root, "guests/[id]/export/route.ts"), "utf8");
      assert.match(route, /routeDashboardActor\(\{ permission: "privacy:requests", stepUp: true \}\)/);
    });
  });

  it("keeps its activity-log entries to the owner: admin, sales and staff can't read the privacy category", async () => {
    const { privacy, audit } = service();
    await privacy.logRequest(actor("owner"), request);
    const entries = await audit.list({ scope: auditScopeFor(actor("owner")), limit: 10 });
    assert.equal(entries.length, 1);
    for (const role of ["admin", "sales", "staff"] as const) {
      assert.equal(inAuditScope(auditScopeFor(actor(role)), entries[0]!), false, role);
    }
  });
});
