import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actor, Role } from "@/lib/kernel/actor";
import { fixedClock } from "@/lib/kernel/ports";
import type { Instants, ReportAccess, ReportPermission, ReportStore } from "./ports";
import { createReportService } from "./report-service";

class NotAllowed extends Error {}

/** The reports' permissions per role, as roles.md grants them. src/server/reports-access.test.ts checks the real matrix too. */
const grants: Record<Role, readonly ReportPermission[]> = {
  owner: ["reports:operations", "reports:revenue"],
  admin: [],
  sales: ["reports:operations"],
  staff: [],
};

const access: ReportAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new NotAllowed(permission);
  },
};

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}1`, role, name: role });

/** A store over fixed records that remembers what it was asked, so a refusal can be shown to read nothing. */
function fakeStore() {
  const asked: string[] = [];
  const instants: Instants[] = [];
  const store: ReportStore = {
    async units() {
      asked.push("units");
      return [{ id: "u1", apartment: "studio", active: true }];
    },
    async staysAround() {
      asked.push("staysAround");
      return [{ unitId: "u1", status: "checked-out", stay: { arrive: "2026-11-10", leave: "2026-11-12" } }];
    },
    async blocksWithin() {
      asked.push("blocksWithin");
      return [];
    },
    async cleansDone(between) {
      asked.push("cleansDone");
      instants.push(between);
      // 23:30 in Johannesburg on 30 Nov is 21:30 UTC: still November there.
      return [new Date("2026-11-12T08:00:00Z"), new Date("2026-11-30T21:30:00Z")];
    },
    async checkedOut(between) {
      asked.push("checkedOut");
      instants.push(between);
      return [{ bookingId: "b1", channel: "booking-com", stay: { arrive: "2026-11-10", leave: "2026-11-12" }, totalCents: 240_000, checkedOutAt: new Date("2026-11-11T22:30:00Z") }];
    },
    async commission() {
      asked.push("commission");
      return [{ journalId: "j1", date: "2026-11-12", cents: 36_000, counterAccounts: ["1110"] }];
    },
    async owing() {
      asked.push("owing");
      return [
        {
          id: "b2",
          ref: "RG-B2C3D",
          status: "confirmed",
          stay: { arrive: "2026-12-10", leave: "2026-12-13" },
          channel: "phone",
          guestName: "Thandi Mokoena",
          totalCents: 240_000,
          depositDueCents: 60_000,
          payments: [],
        },
      ];
    },
    async channelNames() {
      asked.push("channelNames");
      return { "booking-com": "Booking.com" };
    },
    async yearEndMonth() {
      asked.push("yearEndMonth");
      return 2;
    },
  };
  return { store, asked, instants };
}

function serviceWith(fake = fakeStore()) {
  return {
    ...fake,
    service: createReportService({
      store: fake.store,
      apartmentNames: async () => ({ studio: "Studio" }),
      clock: fixedClock("2026-11-12T22:30:00Z"),
      timeZone: "Africa/Johannesburg",
      access,
    }),
  };
}

const november = { from: "2026-11-01", until: "2026-11-30" };

describe("the reports service", () => {
  it("works out today in the business's time zone, with the books' financial year", async () => {
    const { service } = serviceWith();
    // 22:30 UTC on 12 Nov is 00:30 on 13 Nov in Johannesburg.
    assert.deepEqual(await service.dates(actor("sales")), { today: "2026-11-13", yearEndMonth: 2 });
  });

  it("reads days in the business's time zone: the range's instants, cleans and check-outs", async () => {
    const { service, instants } = serviceWith();
    const operations = await service.operations(actor("owner"), november);
    assert.deepEqual(instants[0], { start: new Date("2026-10-31T22:00:00Z"), end: new Date("2026-11-30T22:00:00Z") });
    assert.equal(operations.cleaning.cleans, 2);
    assert.equal(operations.occupancy.total.soldNights, 2);
    assert.equal(operations.occupancy.apartments[0]?.name, "Studio");
    const revenue = await service.revenue(actor("owner"), november);
    assert.equal(revenue.revenue.total.revenueCents, 240_000, "checked out at 00:30 on 12 Nov, local time");
    assert.equal(revenue.revenue.total.adrCents, 120_000);
    assert.deepEqual(
      revenue.channels.rows.map((row) => [row.name, row.revenueCents, row.commissionCents]),
      [["Booking.com", 240_000, 36_000]],
    );
  });

  it("lists what's still to pay as of today", async () => {
    const { service } = serviceWith();
    const { asOf, balances } = await service.balances(actor("owner"));
    assert.equal(asOf, "2026-11-13");
    assert.equal(balances.totalCents, 240_000);
  });

  it("refuses a range it can't cover: the code must work one out first", async () => {
    const { service } = serviceWith();
    await assert.rejects(service.operations(actor("owner"), { from: "2026-11-30", until: "2026-11-01" }), RangeError);
    await assert.rejects(service.revenue(actor("owner"), { from: "2026-01-01", until: "2027-06-30" }), RangeError);
  });

  it("lets sales see operations, but refuses them every revenue figure without reading any", async () => {
    const { service, asked } = serviceWith();
    assert.equal((await service.operations(actor("sales"), november)).occupancy.total.soldNights, 2);
    asked.length = 0;
    await assert.rejects(service.revenue(actor("sales"), november), NotAllowed);
    await assert.rejects(service.balances(actor("sales")), NotAllowed);
    assert.deepEqual(asked, []);
  });

  it("refuses admin (Weberu) and staff every report and its dates, without reading anything", async () => {
    for (const role of ["admin", "staff"] as const) {
      const { service, asked } = serviceWith();
      await assert.rejects(service.dates(actor(role)), NotAllowed, role);
      await assert.rejects(service.operations(actor(role), november), NotAllowed, role);
      await assert.rejects(service.revenue(actor(role), november), NotAllowed, role);
      await assert.rejects(service.balances(actor(role)), NotAllowed, role);
      assert.deepEqual(asked, [], role);
    }
  });
});
