import { z } from "zod";
import type { CsvValue } from "@/lib/format/csv";
import { formatDateShort, formatDateSpan } from "@/lib/format/date-time";
import { addDays, isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { LedgerService } from "@/lib/ledger/ledger-service";
import { financialYearStart, type BalanceSheet, type CashFlow, type ProfitAndLoss, type ReportLine, type TrialBalance } from "@/lib/ledger/reports";
import { adminRoutes } from "../admin-routes";

/**
 * The books' four statements as one shape of table, so the screen, the CSV
 * download and the print view show the same rows and the same figures.
 * Amounts are cents; how they read (R1,250 or 1250.00) is up to whoever
 * shows them.
 */

export const reportKinds = ["profit-and-loss", "balance-sheet", "cash-flow", "trial-balance"] as const;
export type ReportKind = (typeof reportKinds)[number];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (reportKinds as readonly string[]).includes(value);
}

export const reportNames: Record<ReportKind, string> = {
  "profit-and-loss": "Profit and loss",
  "balance-sheet": "Balance sheet",
  "cash-flow": "Cash flow",
  "trial-balance": "Trial balance",
};

export const reportDescriptions: Record<ReportKind, string> = {
  "profit-and-loss": "Income and expenses over the dates, and what's left.",
  "balance-sheet": "What the business owns and owes on the day.",
  "cash-flow": "Money in and out of the bank accounts, cash on hand and the payment gateway.",
  "trial-balance": "Every account with a balance on the day, as debits and credits.",
};

/** The line under every statement's title. */
export const preparedNote = "Prepared from the books, for the owner and their accountant to review.";

/** Profit and loss and cash flow cover a span of dates; the balance sheet and trial balance are on one day. */
export function coversRange(kind: ReportKind): boolean {
  return kind === "profit-and-loss" || kind === "cash-flow";
}

/** Which statement, over which dates. A one-day statement is on `until`. */
export type ReportQuery = { kind: ReportKind; from: IsoDate; until: IsoDate };

/** What the defaults are worked out from: today, and the month the financial year ends (1–12). */
export type ReportContext = { today: IsoDate; yearEndMonth: number };

const firstValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const dayOf = (value: unknown): IsoDate | null => {
  const text = firstValue(value);
  return isIsoDate(text) ? text : null;
};

/**
 * A statement asked for in a page's address, with anything missing filled in
 * (the financial year so far) and anything unreadable replaced by that too.
 * `corrected` says something given couldn't be used as it was.
 */
export function reportQueryFrom(input: Record<string, unknown>, context: ReportContext): { query: ReportQuery; corrected: boolean } {
  const asked = firstValue(input.report);
  const kind = isReportKind(asked) ? asked : "profit-and-loss";
  let corrected = asked !== undefined && !isReportKind(asked);
  const given = (key: string) => {
    const day = dayOf(input[key]);
    if (input[key] !== undefined && day === null) corrected = true;
    return day;
  };
  const untilGiven = coversRange(kind) ? given("until") : (given("at") ?? given("until"));
  let until = untilGiven ?? context.today;
  let from = (coversRange(kind) ? given("from") : null) ?? financialYearStart(until, context.yearEndMonth);
  if (from > until) {
    [from, until] = [until, from];
    corrected = true;
  }
  return { query: { kind, from, until }, corrected };
}

const isoDay = z.string().refine(isIsoDate);
const exportQuerySchema = z.object({ from: isoDay.optional(), until: isoDay.optional(), at: isoDay.optional() });

/** A statement asked for by a download link: null when a date can't be read or the dates are the wrong way round. */
export function parseReportQuery(kind: ReportKind, input: Record<string, unknown>, context: ReportContext): ReportQuery | null {
  const parsed = exportQuerySchema.safeParse(input);
  if (!parsed.success) return null;
  const until = (coversRange(kind) ? parsed.data.until : (parsed.data.at ?? parsed.data.until)) ?? context.today;
  const from = (coversRange(kind) ? parsed.data.from : undefined) ?? financialYearStart(until, context.yearEndMonth);
  return from <= until ? { kind, from, until } : null;
}

/** The query string for a statement: report, from and until, or report and at. */
export function reportSearch(query: ReportQuery): string {
  const params = new URLSearchParams({ report: query.kind });
  if (coversRange(query.kind)) {
    params.set("from", query.from);
    params.set("until", query.until);
  } else {
    params.set("at", query.until);
  }
  return params.toString();
}

export const reportsPath = `${adminRoutes.books}/reports`;

export function reportHref(query: ReportQuery): string {
  return `${reportsPath}?${reportSearch(query)}`;
}

export function printHref(query: ReportQuery): string {
  return `${reportsPath}/print?${reportSearch(query)}`;
}

export function exportHref(query: ReportQuery): string {
  const params = new URLSearchParams(reportSearch(query));
  params.delete("report");
  return `${adminRoutes.books}/export/${query.kind}?${params}`;
}

/** "profit-and-loss-2026-03-01-to-2026-11-12.csv", "balance-sheet-2026-11-12.csv". */
export function exportFileName(query: ReportQuery): string {
  return coversRange(query.kind) ? `${query.kind}-${query.from}-to-${query.until}.csv` : `${query.kind}-${query.until}.csv`;
}

/** "1 Mar – 12 Nov 2026", or "On 12 Nov 2026" for a one-day statement. */
export function reportPeriodLabel(query: ReportQuery): string {
  return coversRange(query.kind) ? formatDateSpan(query.from, query.until) : `On ${formatDateShort(query.until)}`;
}

/** The same statement for other dates people often want: this month, this financial year, the last one. */
export function reportPresets(kind: ReportKind, context: ReportContext): { label: string; query: ReportQuery }[] {
  const yearStart = financialYearStart(context.today, context.yearEndMonth);
  const lastYearEnd = addDays(yearStart, -1);
  if (!coversRange(kind)) {
    return [
      { label: "Today", query: { kind, from: yearStart, until: context.today } },
      { label: "End of last financial year", query: { kind, from: financialYearStart(lastYearEnd, context.yearEndMonth), until: lastYearEnd } },
    ];
  }
  return [
    { label: "This month", query: { kind, from: `${context.today.slice(0, 7)}-01`, until: context.today } },
    { label: "This financial year so far", query: { kind, from: yearStart, until: context.today } },
    { label: "Last financial year", query: { kind, from: financialYearStart(lastYearEnd, context.yearEndMonth), until: lastYearEnd } },
  ];
}

// --- the tables ------------------------------------------------------------------------

/** line: an account or a figure; total: a section's total; result: the statement's bottom line. */
export type ReportRowKind = "line" | "total" | "result";

export type ReportRow = { kind: ReportRowKind; code: string | null; label: string; cells: (number | null)[] };
/** A section under its plain heading ("What the business owns"), with the accountant's word for it ("Assets") when that differs. */
export type ReportSection = { title: string | null; term?: string; rows: ReportRow[] };

export type ReportTable = {
  /** The amount columns' headings. */
  columns: readonly string[];
  sections: ReportSection[];
  /** A check the figures pass or fail, worked out from them: "Debits and credits match." */
  check: { ok: boolean; text: string } | null;
};

const accountRow = (line: ReportLine): ReportRow => ({ kind: "line", code: line.code, label: line.name, cells: [line.cents] });
const figure = (kind: ReportRowKind, label: string, ...cells: (number | null)[]): ReportRow => ({ kind, code: null, label, cells });

export function profitAndLossTable(report: ProfitAndLoss): ReportTable {
  return {
    columns: ["Amount"],
    sections: [
      { title: "Income", rows: [...report.income.map(accountRow), figure("total", "Total income", report.incomeCents)] },
      { title: "Expenses", rows: [...report.expenses.map(accountRow), figure("total", "Total expenses", report.expenseCents)] },
      { title: null, rows: [figure("result", report.profitCents < 0 ? "Loss" : "Profit", Math.abs(report.profitCents))] },
    ],
    check: null,
  };
}

/** Profit or loss as a word, with the amount unsigned: "Loss since 1 Mar 2026" and R4,775, never -R4,775. */
const profitRow = (when: string, cents: number): ReportRow => figure("line", `${cents < 0 ? "Loss" : "Profit"} ${when}`, Math.abs(cents));

/**
 * The balance sheet under plain headings (what the business owns, what it
 * owes, the owner's share), each with the accountant's word beside it. The
 * profit or loss in the owner's share is named as one, never signed.
 */
export function balanceSheetTable(report: BalanceSheet & { yearStart: IsoDate }): ReportTable {
  const owed = report.liabilityCents + report.equityCents;
  return {
    columns: ["Amount"],
    sections: [
      { title: "What the business owns", term: "Assets", rows: [...report.assets.map(accountRow), figure("total", "Total owned", report.assetCents)] },
      { title: "What it owes", term: "Liabilities", rows: [...report.liabilities.map(accountRow), figure("total", "Total owed", report.liabilityCents)] },
      {
        title: "The owner's share",
        term: "Equity",
        rows: [
          ...report.equity.map(accountRow),
          profitRow(`before ${formatDateShort(report.yearStart)}`, report.priorProfitCents),
          profitRow(`since ${formatDateShort(report.yearStart)}`, report.yearProfitCents),
          figure("total", "Total owner's share", report.equityCents),
        ],
      },
      { title: null, rows: [figure("result", "What it owes, plus the owner's share", owed)] },
    ],
    check:
      owed === report.assetCents
        ? { ok: true, text: "What it owns equals what it owes plus the owner's share." }
        : { ok: false, text: "What it owns doesn't equal what it owes plus the owner's share. Ask Weberu to look into it." },
  };
}

export function cashFlowTable(report: CashFlow): ReportTable {
  const moneyIn = report.groups.filter((group) => group.inCents > 0);
  const moneyOut = report.groups.filter((group) => group.outCents > 0);
  const totalIn = moneyIn.reduce((sum, group) => sum + group.inCents, 0);
  const totalOut = moneyOut.reduce((sum, group) => sum + group.outCents, 0);
  return {
    columns: ["Amount"],
    sections: [
      { title: null, rows: [figure("line", "Cash at the start", report.openingCents)] },
      { title: "Money in", rows: [...moneyIn.map((group) => figure("line", group.name, group.inCents)), figure("total", "Total money in", totalIn)] },
      { title: "Money out", rows: [...moneyOut.map((group) => figure("line", group.name, group.outCents)), figure("total", "Total money out", totalOut)] },
      { title: null, rows: [figure("result", "Cash at the end", report.closingCents)] },
    ],
    check: null,
  };
}

export function trialBalanceTable(report: TrialBalance): ReportTable {
  return {
    columns: ["Debit", "Credit"],
    sections: [
      {
        title: null,
        rows: [
          ...report.rows.map((row): ReportRow => ({ kind: "line", code: row.code, label: row.name, cells: [row.debitCents || null, row.creditCents || null] })),
          figure("result", "Totals", report.debitCents, report.creditCents),
        ],
      },
    ],
    check:
      report.debitCents === report.creditCents
        ? { ok: true, text: "Debits and credits match." }
        : { ok: false, text: "Debits and credits don't match. Ask Weberu to look into it." },
  };
}

type ReportSource = Pick<LedgerService, "profitAndLoss" | "balanceSheet" | "cashFlow" | "trialBalance">;

/** Reads a statement from the ledger (which checks the actor may) and lays it out as a table. */
export async function reportTableFor(ledger: ReportSource, actor: Actor, query: ReportQuery): Promise<ReportTable> {
  switch (query.kind) {
    case "profit-and-loss":
      return profitAndLossTable(await ledger.profitAndLoss(actor, { from: query.from, until: query.until }));
    case "balance-sheet":
      return balanceSheetTable(await ledger.balanceSheet(actor, query.until));
    case "cash-flow":
      return cashFlowTable(await ledger.cashFlow(actor, { from: query.from, until: query.until }));
    case "trial-balance":
      return trialBalanceTable(await ledger.trialBalance(actor, query.until));
  }
}

// --- the CSV ---------------------------------------------------------------------------

/** Cents as a spreadsheet reads them: "1250.00", "-0.07". */
export function centsAsDecimal(cents: number): string {
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** The statement as spreadsheet rows: who and what it is, then Code, Account and the amounts. */
export function reportCsvRows(table: ReportTable, query: ReportQuery, businessName: string): CsvValue[][] {
  const rows: CsvValue[][] = [[businessName], [reportNames[query.kind]], [reportPeriodLabel(query)], [preparedNote], [], ["Code", "Account", ...table.columns]];
  for (const section of table.sections) {
    if (section.title) rows.push(["", section.term ? `${section.title} (${section.term})` : section.title]);
    for (const row of section.rows) rows.push([row.code ?? "", row.label, ...row.cells.map((cell) => (cell === null ? "" : centsAsDecimal(cell)))]);
  }
  if (table.check) rows.push([], ["", table.check.text]);
  return rows;
}
