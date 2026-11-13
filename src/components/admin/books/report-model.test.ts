import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvDocument } from "@/lib/format/csv";
import {
  balanceSheetTable,
  cashFlowTable,
  centsAsDecimal,
  exportFileName,
  exportHref,
  parseReportQuery,
  printHref,
  profitAndLossTable,
  reportCsvRows,
  reportHref,
  reportPeriodLabel,
  reportPresets,
  reportQueryFrom,
  trialBalanceTable,
} from "./report-model";

const context = { today: "2026-11-12", yearEndMonth: 2 };

describe("which statement a page's address asks for", () => {
  it("defaults to the profit and loss for the financial year so far", () => {
    assert.deepEqual(reportQueryFrom({}, context), { query: { kind: "profit-and-loss", from: "2026-03-01", until: "2026-11-12" }, corrected: false });
  });

  it("reads the dates given, and the first of repeated values", () => {
    assert.deepEqual(reportQueryFrom({ report: "cash-flow", from: ["2026-10-01", "2026-01-01"], until: "2026-10-31" }, context).query, {
      kind: "cash-flow",
      from: "2026-10-01",
      until: "2026-10-31",
    });
  });

  it("reads one day for the balance sheet and trial balance, starting their year from it", () => {
    assert.deepEqual(reportQueryFrom({ report: "balance-sheet", at: "2026-02-28" }, context).query, { kind: "balance-sheet", from: "2025-03-01", until: "2026-02-28" });
    assert.deepEqual(reportQueryFrom({ report: "trial-balance", until: "2026-06-30" }, context).query, { kind: "trial-balance", from: "2026-03-01", until: "2026-06-30" });
  });

  it("replaces what it can't read with the defaults, and says so", () => {
    assert.deepEqual(reportQueryFrom({ report: "nonsense", from: "2026-02-30", until: "yesterday" }, context), {
      query: { kind: "profit-and-loss", from: "2026-03-01", until: "2026-11-12" },
      corrected: true,
    });
  });

  it("swaps dates given the wrong way round", () => {
    assert.deepEqual(reportQueryFrom({ from: "2026-10-31", until: "2026-10-01" }, context), {
      query: { kind: "profit-and-loss", from: "2026-10-01", until: "2026-10-31" },
      corrected: true,
    });
  });
});

describe("which statement a download link asks for", () => {
  it("takes the dates given, or the financial year so far", () => {
    assert.deepEqual(parseReportQuery("profit-and-loss", { from: "2026-10-01", until: "2026-10-31" }, context), { kind: "profit-and-loss", from: "2026-10-01", until: "2026-10-31" });
    assert.deepEqual(parseReportQuery("cash-flow", {}, context), { kind: "cash-flow", from: "2026-03-01", until: "2026-11-12" });
    assert.deepEqual(parseReportQuery("balance-sheet", { at: "2026-02-28" }, context), { kind: "balance-sheet", from: "2025-03-01", until: "2026-02-28" });
  });

  it("refuses dates it can't read, or the wrong way round", () => {
    assert.equal(parseReportQuery("profit-and-loss", { from: "2026-13-01" }, context), null);
    assert.equal(parseReportQuery("trial-balance", { at: "=1+1" }, context), null);
    assert.equal(parseReportQuery("profit-and-loss", { from: "2026-10-31", until: "2026-10-01" }, context), null);
  });
});

describe("links and labels for a statement", () => {
  const range = { kind: "profit-and-loss", from: "2026-03-01", until: "2026-11-12" } as const;
  const day = { kind: "balance-sheet", from: "2026-03-01", until: "2026-11-12" } as const;

  it("links the page, the print view and the download", () => {
    assert.equal(reportHref(range), "/admin/books/reports?report=profit-and-loss&from=2026-03-01&until=2026-11-12");
    assert.equal(reportHref(day), "/admin/books/reports?report=balance-sheet&at=2026-11-12");
    assert.equal(printHref(day), "/admin/books/reports/print?report=balance-sheet&at=2026-11-12");
    assert.equal(exportHref(range), "/admin/books/export/profit-and-loss?from=2026-03-01&until=2026-11-12");
    assert.equal(exportHref(day), "/admin/books/export/balance-sheet?at=2026-11-12");
  });

  it("names the file and the dates", () => {
    assert.equal(exportFileName(range), "profit-and-loss-2026-03-01-to-2026-11-12.csv");
    assert.equal(exportFileName(day), "balance-sheet-2026-11-12.csv");
    assert.equal(reportPeriodLabel(range), "1 Mar – 12 Nov 2026");
    assert.equal(reportPeriodLabel(day), "On 12 Nov 2026");
  });

  it("offers this month, this financial year and the last one", () => {
    assert.deepEqual(
      reportPresets("cash-flow", context).map((preset) => [preset.label, preset.query.from, preset.query.until]),
      [
        ["This month", "2026-11-01", "2026-11-12"],
        ["This financial year so far", "2026-03-01", "2026-11-12"],
        ["Last financial year", "2025-03-01", "2026-02-28"],
      ],
    );
    assert.deepEqual(
      reportPresets("trial-balance", context).map((preset) => [preset.label, preset.query.until]),
      [
        ["Today", "2026-11-12"],
        ["End of last financial year", "2026-02-28"],
      ],
    );
  });
});

describe("the statements as tables", () => {
  it("lays out profit and loss, naming a loss as one", () => {
    const table = profitAndLossTable({
      income: [{ code: "4000", name: "Accommodation", cents: 100_000 }],
      expenses: [{ code: "5300", name: "Electricity, water and gas", cents: 150_000 }],
      incomeCents: 100_000,
      expenseCents: 150_000,
      profitCents: -50_000,
    });
    assert.deepEqual(table.columns, ["Amount"]);
    assert.deepEqual(
      table.sections.map((section) => [section.title, section.rows.map((row) => [row.code, row.label, row.cells])]),
      [
        ["Income", [["4000", "Accommodation", [100_000]], [null, "Total income", [100_000]]]],
        ["Expenses", [["5300", "Electricity, water and gas", [150_000]], [null, "Total expenses", [150_000]]]],
        [null, [[null, "Loss", [50_000]]]],
      ],
    );
  });

  it("lays out the balance sheet under plain headings, with this year's and earlier profit in the owner's share, and checks it balances", () => {
    const table = balanceSheetTable({
      assets: [{ code: "1000", name: "Bank", cents: 300_000 }],
      liabilities: [{ code: "2000", name: "Guest deposits received", cents: 50_000 }],
      equity: [{ code: "3000", name: "Owner's capital", cents: 200_000 }],
      assetCents: 300_000,
      liabilityCents: 50_000,
      equityCents: 250_000,
      priorProfitCents: 20_000,
      yearProfitCents: 30_000,
      yearStart: "2026-03-01",
    });
    assert.deepEqual(
      table.sections.map((section) => [section.title, section.term ?? null]),
      [
        ["What the business owns", "Assets"],
        ["What it owes", "Liabilities"],
        ["The owner's share", "Equity"],
        [null, null],
      ],
    );
    const equity = table.sections[2]!;
    assert.deepEqual(
      equity.rows.map((row) => [row.label, row.cells[0]]),
      [
        ["Owner's capital", 200_000],
        ["Profit before 1 Mar 2026", 20_000],
        ["Profit since 1 Mar 2026", 30_000],
        ["Total owner's share", 250_000],
      ],
    );
    assert.deepEqual(table.sections[3]!.rows[0]!.cells, [300_000]);
    assert.deepEqual(table.check, { ok: true, text: "What it owns equals what it owes plus the owner's share." });
  });

  it("names a loss in the owner's share as one, with the amount unsigned", () => {
    const table = balanceSheetTable({
      assets: [{ code: "1000", name: "Bank", cents: 152_250 }],
      liabilities: [],
      equity: [{ code: "3000", name: "Owner's capital", cents: 200_000 }],
      assetCents: 152_250,
      liabilityCents: 0,
      equityCents: 152_250,
      priorProfitCents: 0,
      yearProfitCents: -47_750,
      yearStart: "2026-03-01",
    });
    assert.deepEqual(
      table.sections[2]!.rows.slice(1, 3).map((row) => [row.label, row.cells[0]]),
      [
        ["Profit before 1 Mar 2026", 0],
        ["Loss since 1 Mar 2026", 47_750],
      ],
    );
    assert.equal(table.check?.ok, true);
  });

  it("lays out cash flow from the opening cash to the closing cash", () => {
    const table = cashFlowTable({
      openingCents: 10_000,
      closingCents: 60_000,
      groups: [
        { group: "guests", name: "From guests and channels", inCents: 80_000, outCents: 5_000 },
        { group: "expenses", name: "Paid for running the guesthouse", inCents: 0, outCents: 25_000 },
      ],
    });
    assert.deepEqual(
      table.sections.flatMap((section) => section.rows.map((row) => [row.label, row.cells[0]])),
      [
        ["Cash at the start", 10_000],
        ["From guests and channels", 80_000],
        ["Total money in", 80_000],
        ["From guests and channels", 5_000],
        ["Paid for running the guesthouse", 25_000],
        ["Total money out", 30_000],
        ["Cash at the end", 60_000],
      ],
    );
  });

  it("lays out the trial balance in debit and credit columns, leaving the empty side blank", () => {
    const table = trialBalanceTable({
      rows: [
        { code: "1000", name: "Bank", debitCents: 100_000, creditCents: 0 },
        { code: "3000", name: "Owner's capital", debitCents: 0, creditCents: 100_000 },
      ],
      debitCents: 100_000,
      creditCents: 100_000,
    });
    assert.deepEqual(table.columns, ["Debit", "Credit"]);
    assert.deepEqual(
      table.sections[0]!.rows.map((row) => row.cells),
      [
        [100_000, null],
        [null, 100_000],
        [100_000, 100_000],
      ],
    );
    assert.equal(table.check?.ok, true);
  });
});

describe("the CSV download", () => {
  it("writes cents as plain decimals", () => {
    assert.equal(centsAsDecimal(125_050), "1250.50");
    assert.equal(centsAsDecimal(-7), "-0.07");
    assert.equal(centsAsDecimal(0), "0.00");
  });

  it("heads the rows with the business, the statement and its dates, then the figures", () => {
    const query = { kind: "trial-balance", from: "2026-03-01", until: "2026-11-12" } as const;
    const table = trialBalanceTable({ rows: [{ code: "1000", name: "Bank", debitCents: 125_050, creditCents: 0 }], debitCents: 125_050, creditCents: 0 });
    const csv = csvDocument(reportCsvRows(table, query, "Romaic Guesthouse"));
    assert.equal(
      csv,
      [
        "﻿Romaic Guesthouse",
        "Trial balance",
        "On 12 Nov 2026",
        `"Prepared from the books, for the owner and their accountant to review."`,
        "",
        "Code,Account,Debit,Credit",
        "1000,Bank,1250.50,",
        ",Totals,1250.50,0.00",
        "",
        ",Debits and credits don't match. Ask Weberu to look into it.",
        "",
      ].join("\r\n"),
    );
  });

  it("puts the accountant's word beside a plain section heading", () => {
    const query = { kind: "balance-sheet", from: "2026-03-01", until: "2026-11-12" } as const;
    const table = balanceSheetTable({
      assets: [{ code: "1000", name: "Bank", cents: 100 }],
      liabilities: [],
      equity: [],
      assetCents: 100,
      liabilityCents: 0,
      equityCents: 100,
      priorProfitCents: 0,
      yearProfitCents: 100,
      yearStart: "2026-03-01",
    });
    const rows = reportCsvRows(table, query, "Romaic Guesthouse");
    assert.deepEqual(rows[6], ["", "What the business owns (Assets)"]);
    assert.ok(rows.some((row) => row[1] === "The owner's share (Equity)"));
  });

  it("guards account names a spreadsheet would run as a formula", () => {
    const query = { kind: "profit-and-loss", from: "2026-03-01", until: "2026-11-12" } as const;
    const table = profitAndLossTable({ income: [{ code: "4900", name: "=HYPERLINK(\"x\")", cents: 100 }], expenses: [], incomeCents: 100, expenseCents: 0, profitCents: 100 });
    assert.match(csvDocument(reportCsvRows(table, query, "Romaic Guesthouse")), /\r\n4900,"'=HYPERLINK\(""x""\)",1\.00\r\n/);
  });
});
