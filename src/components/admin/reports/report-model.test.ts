import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvDocument } from "@/lib/format/csv";
import { occupancyOf, balancesOf, channelMixOf, revenueOf } from "@/lib/reports/reports";
import {
  balancesCsv,
  channelsCsv,
  csvPreamble,
  downloadRequirement,
  exportFileName,
  exportHref,
  formatAxisRands,
  formatRate,
  houseSummary,
  isRevenueReport,
  moneySummary,
  niceScale,
  occupancyCsv,
  operationsHref,
  parseRangeQuery,
  rangeLabel,
  rangePresets,
  rangeQueryFrom,
  ratesCsv,
  reportKinds,
  reportSources,
  reportSummaries,
  revenueHref,
  weekAxisLabel,
  weekLabel,
  weekPhrase,
} from "./report-model";

const context = { today: "2026-11-13", yearEndMonth: 2 };

describe("which dates a report page's address asks for", () => {
  it("defaults to the whole of this month", () => {
    assert.deepEqual(rangeQueryFrom({}, context), { range: { from: "2026-11-01", until: "2026-11-30" }, corrected: false });
  });

  it("reads the dates given, and the first of repeated values", () => {
    assert.deepEqual(rangeQueryFrom({ from: ["2026-10-01", "2026-01-01"], until: "2026-10-31" }, context), { range: { from: "2026-10-01", until: "2026-10-31" }, corrected: false });
  });

  it("falls back to this month when a date is missing or unreadable, and says so", () => {
    assert.deepEqual(rangeQueryFrom({ from: "2026-02-30", until: "2026-03-31" }, context), { range: { from: "2026-11-01", until: "2026-11-30" }, corrected: true });
    assert.deepEqual(rangeQueryFrom({ from: "2026-10-01" }, context), { range: { from: "2026-11-01", until: "2026-11-30" }, corrected: true });
  });

  it("swaps dates given the wrong way round, and cuts a span to a year", () => {
    assert.deepEqual(rangeQueryFrom({ from: "2026-10-31", until: "2026-10-01" }, context), { range: { from: "2026-10-01", until: "2026-10-31" }, corrected: true });
    assert.deepEqual(rangeQueryFrom({ from: "2025-01-01", until: "2026-12-31" }, context), { range: { from: "2025-01-01", until: "2026-01-01" }, corrected: true });
  });
});

describe("which dates a download asks for", () => {
  it("is this month without dates, the dates given when they work, and nothing otherwise", () => {
    assert.deepEqual(parseRangeQuery({}, context), { from: "2026-11-01", until: "2026-11-30" });
    assert.deepEqual(parseRangeQuery({ from: "2026-03-01", until: "2027-02-28" }, context), { from: "2026-03-01", until: "2027-02-28" });
    assert.equal(parseRangeQuery({ from: "2026-03-01" }, context), null);
    assert.equal(parseRangeQuery({ from: "2026-11-30", until: "2026-11-01" }, context), null);
    assert.equal(parseRangeQuery({ from: "2025-01-01", until: "2026-12-31" }, context), null);
  });
});

describe("the date presets", () => {
  it("offer whole months around today and the financial year from the books' settings", () => {
    assert.deepEqual(
      rangePresets(context).map((preset) => [preset.label, preset.range.from, preset.range.until]),
      [
        ["This month", "2026-11-01", "2026-11-30"],
        ["Last month", "2026-10-01", "2026-10-31"],
        ["Next month", "2026-12-01", "2026-12-31"],
        ["This financial year so far", "2026-03-01", "2026-11-13"],
        ["Last financial year", "2025-03-01", "2026-02-28"],
      ],
    );
    assert.deepEqual(rangePresets({ today: "2027-01-31", yearEndMonth: 6 })[4]?.range, { from: "2025-07-01", until: "2026-06-30" });
  });
});

describe("how a report's dates read", () => {
  it("names a whole month or months, and otherwise gives the dates", () => {
    assert.equal(rangeLabel({ from: "2026-11-01", until: "2026-11-30" }), "November 2026");
    assert.equal(rangeLabel({ from: "2026-03-01", until: "2027-02-28" }), "Mar 2026 – Feb 2027");
    assert.equal(rangeLabel({ from: "2026-03-01", until: "2026-11-13" }), "1 Mar – 13 Nov 2026");
  });

  it("names weeks for a sentence and for a chart's axis", () => {
    const whole = { key: "2026-11-02", from: "2026-11-02", until: "2026-11-08", days: 7, whole: true };
    const cut = { key: "2026-10-26", from: "2026-11-01", until: "2026-11-01", days: 1, whole: false };
    assert.equal(weekLabel(whole), "Week of 2 Nov");
    assert.equal(weekPhrase(whole), "the week of 2 Nov");
    assert.equal(weekLabel(cut), "1 Nov 2026");
    assert.equal(weekAxisLabel(cut), "1 Nov");
  });
});

describe("where reports and downloads live, and who may download them", () => {
  const range = { from: "2026-11-01", until: "2026-11-30" };

  it("keeps the dates on every link", () => {
    assert.equal(operationsHref(range), "/admin/reports?from=2026-11-01&until=2026-11-30");
    assert.equal(revenueHref(range), "/admin/reports/revenue?from=2026-11-01&until=2026-11-30");
    assert.equal(exportHref("occupancy", range), "/admin/reports/export/occupancy?from=2026-11-01&until=2026-11-30");
    assert.equal(exportHref("still-to-pay", range), "/admin/reports/export/still-to-pay");
    assert.equal(exportFileName("rates", range, "2026-11-13"), "rates-2026-11-01-to-2026-11-30.csv");
    assert.equal(exportFileName("still-to-pay", range, "2026-11-13"), "still-to-pay-2026-11-13.csv");
  });

  it("asks finance:export and a recent password and code for every money report, reports:operations for the rest", () => {
    for (const kind of reportKinds) {
      assert.deepEqual(downloadRequirement(kind), isRevenueReport(kind) ? { permission: "finance:export", stepUp: true } : { permission: "reports:operations" }, kind);
    }
    assert.deepEqual(reportKinds.filter(isRevenueReport), ["rates", "channels", "still-to-pay"]);
  });

  it("says in one line what each report counts and where from", () => {
    for (const kind of reportKinds) assert.ok(reportSources[kind].length > 40 && !reportSources[kind].includes("\n"), kind);
  });

  it("opens each report with one short plain line, shorter than the full account", () => {
    for (const kind of reportKinds) {
      const line = reportSummaries[kind];
      assert.ok(line.length <= 90 && !line.includes("(") && line.endsWith(".") && line.length < reportSources[kind].length, kind);
    }
    assert.equal(reportSummaries.occupancy, "How many of the nights you had open were booked.");
  });
});

describe("the headline sentence under the dates", () => {
  it("puts the house in one line, in words for nothing", () => {
    assert.equal(houseSummary({ occupancyRate: 0.1, arrivals: 3, departures: 3, cleans: 0 }), "10% full · 3 arrivals · 3 departures · no cleans");
    assert.equal(houseSummary({ occupancyRate: 0.64, arrivals: 1, departures: 0, cleans: 1 }), "64% full · 1 arrival · no departures · 1 clean");
    assert.equal(houseSummary({ occupancyRate: null, arrivals: 0, departures: 0, cleans: 1_204 }), "No nights open · no arrivals · no departures · 1,204 cleans");
  });

  it("puts the money in one line, still to pay as of today", () => {
    assert.equal(moneySummary({ revenueCents: 170_000, adrCents: 85_000, stillToPayCents: 460_000 }), "R1,700 from stays · R850 a night booked · R4,600 still to pay as of today");
    assert.equal(moneySummary({ revenueCents: 0, adrCents: null, stillToPayCents: 0 }), "Nothing from stays · nothing owed as of today");
    assert.equal(moneySummary({ revenueCents: 125_050, adrCents: 41_683, stillToPayCents: 0 }), "R1,250.50 from stays · R416.83 a night booked · nothing owed as of today");
  });
});

describe("how figures read", () => {
  it("gives occupancy as a whole percentage, never 0% for nothing open", () => {
    assert.equal(formatRate(6 / 85), "7%");
    assert.equal(formatRate(0.001), "Under 1%");
    assert.equal(formatRate(0), "0%");
    assert.equal(formatRate(null), "None open");
  });

  it("finds round axis steps, whole ones for counts", () => {
    assert.deepEqual(niceScale(9, { counts: true }), { top: 10, ticks: [0, 5, 10] });
    assert.deepEqual(niceScale(3, { counts: true }), { top: 3, ticks: [0, 1, 2, 3] });
    assert.deepEqual(niceScale(450_001), { top: 600_000, ticks: [0, 200_000, 400_000, 600_000] });
    assert.deepEqual(niceScale(0), { top: 1, ticks: [0, 1] });
  });

  it("writes rands compactly on an axis", () => {
    assert.equal(formatAxisRands(0), "R0");
    assert.equal(formatAxisRands(450_000), "R4,500");
    assert.equal(formatAxisRands(4_500_000), "R45K");
    assert.equal(formatAxisRands(125_000_000), "R1.3M");
  });
});

describe("the spreadsheets", () => {
  it("say who, what, when and what's counted before the figures", () => {
    assert.deepEqual(csvPreamble("occupancy", "Romaic Guesthouse", "November 2026"), [["Romaic Guesthouse"], ["Occupancy"], ["November 2026"], [reportSources.occupancy], []]);
  });

  it("lay out occupancy by month and apartment, with what was left out", () => {
    const occupancy = occupancyOf({
      range: { from: "2026-11-01", until: "2026-11-30" },
      units: [{ id: "u1", apartment: "studio", active: true }],
      stays: [{ unitId: "u1", status: "confirmed", stay: { arrive: "2026-11-10", leave: "2026-11-13" } }],
      blocks: [{ unitId: "u1", reason: "maintenance", stay: { arrive: "2026-11-01", leave: "2026-11-03" } }],
      apartmentNames: { studio: "Studio" },
    });
    const rows = occupancyCsv(occupancy);
    assert.deepEqual(rows[1], ["November 2026", "2026-11-01", "2026-11-30", 30, 0, 2, 28, 3, "10.7"]);
    assert.deepEqual(rows[4], ["Room type", "Units", "", "Unit nights", "Closed by the owner", "Closed for maintenance", "Nights open", "Nights booked", "Occupancy (%)"]);
    assert.deepEqual(rows[5], ["Studio", 1, "", 30, 0, 2, 28, 3, "10.7"]);
  });

  it("name the money figures as the screen does", () => {
    const range = { from: "2026-11-01", until: "2026-11-30" };
    const occupancy = occupancyOf({ range, units: [{ id: "u1", apartment: "studio", active: true }], stays: [], blocks: [], apartmentNames: { studio: "Studio" } });
    const rows = ratesCsv(revenueOf(range, [{ bookingId: "b1", channel: "direct", stay: { arrive: "2026-11-10", leave: "2026-11-12" }, totalCents: 170_000, checkedOutOn: "2026-11-12" }], occupancy));
    assert.deepEqual(rows[0], [
      "Month",
      "From",
      "Until",
      "Money from stays",
      "Stays checked out",
      "Nights in those stays",
      "Average per night booked (ADR)",
      "Nights open",
      "Earned per night open (RevPAR)",
    ]);
    assert.deepEqual(rows.at(-1), ["Total", "", "", "1700.00", 1, 2, "850.00", 30, "56.67"]);
  });

  it("write amounts as plain decimals and guard text a spreadsheet would run", () => {
    const channels = channelMixOf(
      { from: "2026-11-01", until: "2026-11-30" },
      [{ bookingId: "b1", channel: "=cmd", stay: { arrive: "2026-11-01", leave: "2026-11-03" }, totalCents: 125_050, checkedOutOn: "2026-11-03" }],
      [],
      {},
    );
    const file = csvDocument(channelsCsv(channels));
    assert.ok(file.includes("'=cmd,1,2,1250.50,0.00"), file);
    assert.deepEqual(channelsCsv(channels)[0], ["Where bookings came from", "Stays checked out", "Nights", "Money from stays", "Commission paid to channels"]);
    const balances = balancesOf([
      {
        id: "b1",
        ref: "RG-B2C3D",
        status: "confirmed",
        stay: { arrive: "2026-12-10", leave: "2026-12-13" },
        channel: "booking-com",
        guestName: "@Thandi",
        totalCents: 240_000,
        depositDueCents: 0,
        payments: [],
      },
    ]);
    assert.deepEqual(balancesCsv(balances)[1], ["RG-B2C3D", "@Thandi", "Confirmed", "2026-12-10", "2026-12-13", "Booking.com", "2400.00", "0.00", "2400.00"]);
    assert.ok(csvDocument(balancesCsv(balances)).includes("'@Thandi"));
  });
});
