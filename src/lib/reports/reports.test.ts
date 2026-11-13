import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Payment } from "@/lib/money/money";
import {
  balancesOf,
  channelMixOf,
  commissionChannel,
  movementsOf,
  occupancyOf,
  revenueOf,
  throughputOf,
  type CheckedOutStay,
  type CommissionEntry,
  type HeldBlock,
  type HeldStay,
  type OwingBooking,
  type ReportUnit,
} from "./reports";

const november = { from: "2026-11-01", until: "2026-11-30" };

const units: ReportUnit[] = [
  { id: "u1", apartment: "family-shower", active: true },
  { id: "u2", apartment: "family-shower", active: true },
  { id: "u3", apartment: "studio", active: true },
  { id: "u4", apartment: "studio", active: false },
];

const stay = (unitId: string, status: HeldStay["status"], arrive: string, leave: string): HeldStay => ({ unitId, status, stay: { arrive, leave } });

const stays: HeldStay[] = [
  stay("u1", "confirmed", "2026-11-10", "2026-11-13"),
  stay("u2", "checked-out", "2026-10-30", "2026-11-02"),
  stay("u3", "checked-in", "2026-11-29", "2026-12-03"),
  stay("u1", "cancelled", "2026-11-20", "2026-11-22"),
  stay("u2", "no-show", "2026-11-24", "2026-11-25"),
  stay("u4", "confirmed", "2026-11-05", "2026-11-08"),
];

const block = (unitId: string, reason: HeldBlock["reason"], arrive: string, leave: string): HeldBlock => ({ unitId, reason, stay: { arrive, leave } });

const blocks: HeldBlock[] = [
  block("u2", "owner", "2026-11-15", "2026-11-17"),
  block("u3", "maintenance", "2026-10-30", "2026-11-04"),
  block("u1", "channel", "2026-11-25", "2026-11-27"),
  block("u2", "request", "2026-11-20", "2026-11-21"),
  block("u4", "owner", "2026-11-01", "2026-12-01"),
];

const apartmentNames = { "family-shower": "Family room with shower" };

describe("occupancy", () => {
  const occupancy = occupancyOf({ range: november, units, stays, blocks, apartmentNames });

  it("is nights sold over switched-on units' nights, less nights closed by the owner and for maintenance", () => {
    assert.equal(occupancy.activeUnits, 3);
    assert.deepEqual(occupancy.total, { unitNights: 90, closedNights: 2, maintenanceNights: 3, availableNights: 85, soldNights: 6, rate: 6 / 85 });
  });

  it("counts only bookings that hold their nights, and only their nights inside the dates", () => {
    // u1 10–13 Nov: 3; u2 to 2 Nov: 1 (the night of 1 Nov); u3 from 29 Nov: 2. Cancelled and no-show stays hold nothing.
    assert.equal(occupancy.total.soldNights, 6);
  });

  it("leaves switched-off units out of both sides, and says how many booked nights that leaves out", () => {
    assert.equal(occupancy.switchedOffNights, 3);
    assert.equal(occupancy.total.unitNights, 3 * 30);
  });

  it("counts channel stays and waiting requests as available, not sold, and reports them", () => {
    assert.deepEqual(occupancy.heldNotSold, { channelNights: 2, requestNights: 1 });
  });

  it("splits by apartment type, named from the site's content (or by slug)", () => {
    assert.deepEqual(
      occupancy.apartments.map(({ apartment, name, units: count, availableNights, soldNights }) => ({ apartment, name, count, availableNights, soldNights })),
      [
        { apartment: "family-shower", name: "Family room with shower", count: 2, availableNights: 58, soldNights: 4 },
        { apartment: "studio", name: "studio", count: 1, availableNights: 27, soldNights: 2 },
      ],
    );
  });

  it("splits by month, cutting stays and closures at the month's end", () => {
    const split = occupancyOf({ range: { from: "2026-10-31", until: "2026-11-01" }, units, stays, blocks, apartmentNames });
    assert.deepEqual(
      split.months.map(({ month, unitNights, maintenanceNights, soldNights }) => ({ month: month.key, unitNights, maintenanceNights, soldNights })),
      [
        { month: "2026-10", unitNights: 3, maintenanceNights: 1, soldNights: 1 },
        { month: "2026-11", unitNights: 3, maintenanceNights: 1, soldNights: 1 },
      ],
    );
  });

  it("gives no rate, rather than 0%, when no night was available", () => {
    const none = occupancyOf({ range: november, units: [], stays, blocks, apartmentNames });
    assert.equal(none.total.rate, null);
    assert.equal(none.total.availableNights, 0);
    assert.deepEqual(none.apartments, []);
  });
});

describe("arrivals and departures", () => {
  it("counts bookings that hold their nights on their arrival and leaving days, in any unit", () => {
    const movements = movementsOf(november, stays);
    // Arrivals: 10 Nov, 29 Nov and 5 Nov (a switched-off unit still had a guest). Departures: 13 Nov, 2 Nov and 8 Nov.
    assert.equal(movements.arrivals, 3);
    assert.equal(movements.departures, 3);
    assert.deepEqual(movements.months.map(({ month, arrivals, departures }) => ({ month: month.key, arrivals, departures })), [{ month: "2026-11", arrivals: 3, departures: 3 }]);
  });

  it("puts each in the month it happens", () => {
    const movements = movementsOf({ from: "2026-10-01", until: "2026-12-31" }, stays);
    assert.deepEqual(
      movements.months.map(({ month, arrivals, departures }) => ({ month: month.key, arrivals, departures })),
      [
        { month: "2026-10", arrivals: 1, departures: 0 },
        { month: "2026-11", arrivals: 3, departures: 3 },
        { month: "2026-12", arrivals: 0, departures: 1 },
      ],
    );
  });
});

describe("cleans done per week", () => {
  it("counts each clean in its week, Monday first, with empty weeks at nothing", () => {
    const cleaning = throughputOf({ from: "2026-11-02", until: "2026-11-22" }, ["2026-11-02", "2026-11-08", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-23", "2026-11-01"]);
    assert.equal(cleaning.cleans, 5);
    assert.deepEqual(
      cleaning.weeks.map(({ week, cleans }) => [week.key, cleans]),
      [
        ["2026-11-02", 2],
        ["2026-11-09", 0],
        ["2026-11-16", 3],
      ],
    );
    assert.equal(cleaning.busiest?.week.key, "2026-11-16");
  });

  it("has no busiest week when nothing was cleaned", () => {
    assert.equal(throughputOf(november, []).busiest, null);
  });
});

const checkedOut = (bookingId: string, channel: string, arrive: string, leave: string, totalCents: number, checkedOutOn: string): CheckedOutStay => ({
  bookingId,
  channel,
  stay: { arrive, leave },
  totalCents,
  checkedOutOn,
});

const revenueStays = [
  checkedOut("b1", "booking-com", "2026-10-30", "2026-11-02", 300_000, "2026-11-02"),
  checkedOut("b2", "direct", "2026-11-10", "2026-11-12", 150_001, "2026-11-12"),
  checkedOut("b3", "booking-com", "2026-11-28", "2026-12-01", 999_999, "2026-12-01"),
];

describe("accommodation revenue, ADR and RevPAR", () => {
  const occupancy = occupancyOf({ range: november, units, stays, blocks, apartmentNames });
  const revenue = revenueOf(november, revenueStays, occupancy);

  it("adds the totals of stays checked out in the dates, over all their nights", () => {
    assert.equal(revenue.total.revenueCents, 450_001);
    assert.equal(revenue.total.stays, 2);
    assert.equal(revenue.total.nights, 5);
  });

  it("divides by the stays' nights for ADR and by the nights available for RevPAR, to whole cents", () => {
    assert.equal(revenue.total.adrCents, 90_000);
    assert.equal(revenue.total.availableNights, 85);
    assert.equal(revenue.total.revparCents, Math.round(450_001 / 85));
  });

  it("gives no ADR or RevPAR, rather than R0, with nothing to divide by", () => {
    const none = revenueOf(november, [], { total: { ...occupancy.total, availableNights: 0 }, months: [] });
    assert.equal(none.total.revenueCents, 0);
    assert.equal(none.total.adrCents, null);
    assert.equal(none.total.revparCents, null);
  });

  it("splits by the month of check-out, with each month's own nights available", () => {
    const autumn = { from: "2026-11-01", until: "2026-12-31" };
    const split = revenueOf(autumn, revenueStays, occupancyOf({ range: autumn, units, stays, blocks, apartmentNames }));
    assert.deepEqual(
      split.months.map(({ month, revenueCents, availableNights }) => [month.key, revenueCents, availableNights]),
      [
        ["2026-11", 450_001, 85],
        ["2026-12", 999_999, 93],
      ],
    );
  });
});

const entry = (journalId: string, date: string, cents: number, counterAccounts: string[]): CommissionEntry => ({ journalId, date, cents, counterAccounts });

describe("revenue and commission by channel", () => {
  const commission = [
    entry("j1", "2026-11-03", 45_000, ["1110"]),
    entry("j2", "2026-11-04", -5_000, ["1110"]),
    entry("j3", "2026-11-05", 2_000, ["1000"]),
    entry("j4", "2026-11-06", 1_000, ["1100"]),
    entry("j5", "2026-10-31", 7_000, ["1110"]),
    entry("j6", "2026-11-07", 3_000, ["1111"]),
  ];
  const mix = channelMixOf(november, revenueStays, commission, { "booking-com": "Booking.com", airbnb: "Airbnb" });

  it("ties commission to a channel through the receivable it was taken off, net of reversals", () => {
    assert.deepEqual(
      mix.rows.map(({ kind, key, name, stays: count, revenueCents, commissionCents }) => ({ kind, key, name, count, revenueCents, commissionCents })),
      [
        { kind: "source", key: "booking-com", name: "Booking.com", count: 1, revenueCents: 300_000, commissionCents: 40_000 },
        { kind: "source", key: "direct", name: "Direct (website)", count: 1, revenueCents: 150_001, commissionCents: 0 },
        { kind: "source", key: "airbnb", name: "Airbnb", count: 0, revenueCents: 0, commissionCents: 3_000 },
        { kind: "other-channels", key: null, name: "Other channels", count: 0, revenueCents: 0, commissionCents: 1_000 },
        { kind: "untied", key: null, name: "Not tied to a channel", count: 0, revenueCents: 0, commissionCents: 2_000 },
      ],
    );
    assert.equal(mix.revenueCents, 450_001);
    assert.equal(mix.commissionCents, 46_000);
  });

  it("can't tie a journal touching no channel receivable, or more than one", () => {
    assert.equal(commissionChannel({ counterAccounts: ["1000"] }), null);
    assert.equal(commissionChannel({ counterAccounts: ["1110", "1111"] }), null);
    assert.equal(commissionChannel({ counterAccounts: ["1112", "1112"] }), "expedia");
    assert.equal(commissionChannel({ counterAccounts: ["1100"] }), "other-channels");
  });
});

let paymentNumber = 0;
const payment = (bookingId: string, fields: Partial<Payment> = {}): Payment => ({
  id: `p${(paymentNumber += 1)}`,
  bookingId,
  kind: "deposit",
  method: "eft",
  amountCents: 50_000,
  receivedOn: "2026-11-01",
  reference: null,
  status: "received",
  receiptNumber: null,
  providerRef: null,
  idempotencyKey: null,
  recordedBy: null,
  createdAt: new Date("2026-11-01T08:00:00Z"),
  voidedAt: null,
  voidReason: null,
  ...fields,
});

const owing = (id: string, status: OwingBooking["status"], arrive: string, totalCents: number, payments: Payment[]): OwingBooking => ({
  id,
  ref: `RG-${id.toUpperCase().padEnd(5, "X")}`,
  status,
  stay: { arrive, leave: "2026-12-31" },
  channel: "direct",
  guestName: `Guest ${id}`,
  totalCents,
  depositDueCents: 0,
  payments,
});

describe("still to pay", () => {
  const balances = balancesOf([
    owing("b1", "confirmed", "2026-12-10", 200_000, [payment("b1")]),
    owing("b2", "checked-out", "2026-11-01", 100_000, [payment("b2", { amountCents: 100_000 })]),
    owing("b3", "checked-in", "2026-11-12", 100_000, [payment("b3", { amountCents: 120_000 }), payment("b3", { kind: "refund", amountCents: 30_000 })]),
    owing("b4", "cancelled", "2026-11-20", 50_000, []),
    owing("b5", "checked-out", "2026-11-05", 80_000, [payment("b5", { amountCents: 80_000, voidedAt: new Date(), voidReason: "Typed twice" }), payment("b5", { status: "pending" })]),
  ]);

  it("lists bookings that hold their nights with money owed, using the money core's sum, in arrival order", () => {
    assert.deepEqual(
      balances.rows.map(({ bookingId, paidCents, balanceCents }) => [bookingId, paidCents, balanceCents]),
      [
        ["b5", 0, 80_000],
        ["b3", 90_000, 10_000],
        ["b1", 50_000, 150_000],
      ],
    );
    assert.equal(balances.totalCents, 240_000);
  });

  it("groups them: stayed and gone, in the house, not checked in yet", () => {
    assert.deepEqual(
      balances.groups.map(({ status, rows, totalCents }) => [status, rows.length, totalCents]),
      [
        ["checked-out", 1, 80_000],
        ["checked-in", 1, 10_000],
        ["confirmed", 1, 150_000],
      ],
    );
  });

  it("is empty when everything's paid", () => {
    assert.deepEqual(balancesOf([owing("b2", "checked-out", "2026-11-01", 100_000, [payment("b2", { amountCents: 100_000 })])]), { rows: [], totalCents: 0, groups: [] });
  });
});
