import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCan, can, dashboardAccess, NotAllowedError, type SignedInState } from "@/lib/accounts/access";
import type { Actor, Role } from "@/lib/kernel/actor";
import { fixedClock } from "@/lib/kernel/ports";
import type { ReportStore } from "@/lib/reports/ports";
import { createReportService } from "@/lib/reports/report-service";

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}0`, role, name: role });

/** A store that holds one booking of each kind of figure and counts every read, so a refusal can be shown to read nothing. */
function service() {
  let reads = 0;
  const read = <T>(value: T) => {
    reads += 1;
    return Promise.resolve(value);
  };
  const store: ReportStore = {
    units: () => read([{ id: "u1", apartment: "studio", active: true }]),
    staysAround: () => read([{ unitId: "u1", status: "confirmed" as const, stay: { arrive: "2026-11-10", leave: "2026-11-12" } }]),
    blocksWithin: () => read([]),
    cleansDone: () => read([new Date("2026-11-12T08:00:00Z")]),
    checkedOut: () => read([]),
    commission: () => read([]),
    owing: () => read([]),
    channelNames: () => read({}),
    yearEndMonth: () => read(2),
  };
  const reports = createReportService({
    store,
    apartmentNames: async () => ({}),
    clock: fixedClock("2026-11-12T08:00:00Z"),
    timeZone: "Africa/Johannesburg",
    access: { can, assertCan },
  });
  return { reports, reads: () => reads };
}

const november = { from: "2026-11-01", until: "2026-11-30" };

const signedIn = (role: Role): SignedInState => ({ actor: actor(role), mfaDue: false, mustChangePassword: false, mfaEnrolmentDue: false, stepUpAt: new Date("2026-11-12T08:00:00Z") });
const now = new Date("2026-11-12T08:05:00Z");

describe("reports with the real permission matrix (roles.md)", () => {
  it("let the owner see every report", async () => {
    const { reports } = service();
    const owner = actor("owner");
    assert.equal((await reports.dates(owner)).yearEndMonth, 2);
    assert.equal((await reports.operations(owner, november)).occupancy.total.soldNights, 2);
    assert.equal((await reports.revenue(owner, november)).revenue.total.revenueCents, 0);
    assert.equal((await reports.balances(owner)).balances.totalCents, 0);
  });

  it("let sales see operations, and refuse them revenue and balances without reading a figure", async () => {
    const { reports, reads } = service();
    const sales = actor("sales");
    assert.equal((await reports.dates(sales)).today, "2026-11-12");
    assert.equal((await reports.operations(sales, november)).cleaning.cleans, 1);
    const before = reads();
    await assert.rejects(reports.revenue(sales, november), NotAllowedError);
    await assert.rejects(reports.balances(sales), NotAllowedError);
    assert.equal(reads(), before);
  });

  it("refuse admin (Weberu) and staff every report, without reading anything", async () => {
    for (const role of ["admin", "staff"] as const) {
      const { reports, reads } = service();
      await assert.rejects(reports.dates(actor(role)), NotAllowedError, role);
      await assert.rejects(reports.operations(actor(role), november), NotAllowedError, role);
      await assert.rejects(reports.revenue(actor(role), november), NotAllowedError, role);
      await assert.rejects(reports.balances(actor(role)), NotAllowedError, role);
      assert.equal(reads(), 0, role);
    }
  });

  it("keep admin and staff off every report page and download, and sales off the money ones", () => {
    const requirements = [
      { permission: "reports:operations" as const },
      { permission: "reports:revenue" as const },
      { permission: "finance:export" as const, stepUp: true },
    ];
    for (const role of ["admin", "staff"] as const) {
      for (const requirement of requirements) assert.equal(dashboardAccess(signedIn(role), requirement, now).status, "not-allowed", `${role} ${requirement.permission}`);
    }
    assert.equal(dashboardAccess(signedIn("sales"), requirements[0]!, now).status, "allowed");
    assert.equal(dashboardAccess(signedIn("sales"), requirements[1]!, now).status, "not-allowed");
    assert.equal(dashboardAccess(signedIn("sales"), requirements[2]!, now).status, "not-allowed");
    for (const requirement of requirements) assert.equal(dashboardAccess(signedIn("owner"), requirement, now).status, "allowed", requirement.permission);
  });

  it("ask the owner to confirm their password and code again for a revenue download after 15 minutes", () => {
    const stale = { ...signedIn("owner"), stepUpAt: new Date("2026-11-12T07:40:00Z") };
    assert.equal(dashboardAccess(stale, { permission: "finance:export", stepUp: true }, now).status, "step-up-due");
    assert.equal(dashboardAccess(stale, { permission: "reports:operations" }, now).status, "allowed");
  });
});
