import { addDays, type IsoDate } from "@/lib/format/zoned-time";
import { debitNormal, isCashAccount, kindOfCode, type AccountKind, type LedgerAccount } from "./accounts";
import type { Journal } from "./journals";
import type { AccountSums } from "./ports";

/**
 * The statements, worked out from account totals: pure functions, so the
 * same figures come out of the screen, the CSV and the print view.
 */

export type ReportLine = { code: string; name: string; cents: number };

/** An account's balance on its normal side: positive is the usual way round (a debit balance on an asset). */
export function normalBalance(kind: AccountKind, sums: Pick<AccountSums, "debitCents" | "creditCents">): number {
  return debitNormal(kind) ? sums.debitCents - sums.creditCents : sums.creditCents - sums.debitCents;
}

function byCode(sums: readonly AccountSums[]): Map<string, AccountSums> {
  return new Map(sums.map((sum) => [sum.accountCode, sum]));
}

function linesOf(accounts: readonly LedgerAccount[], sums: readonly AccountSums[], kinds: readonly AccountKind[]): ReportLine[] {
  const totals = byCode(sums);
  return accounts
    .filter((account) => kinds.includes(account.kind))
    .map((account) => ({ code: account.code, name: account.name, cents: normalBalance(account.kind, totals.get(account.code) ?? { debitCents: 0, creditCents: 0 }) }))
    .filter((row) => row.cents !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}

const total = (rows: readonly ReportLine[]) => rows.reduce((sum, row) => sum + row.cents, 0);

export type TrialBalance = { rows: { code: string; name: string; debitCents: number; creditCents: number }[]; debitCents: number; creditCents: number };

/** Every account with a balance, on the side it falls, and the two totals (which match). */
export function trialBalance(accounts: readonly LedgerAccount[], sums: readonly AccountSums[]): TrialBalance {
  const totals = byCode(sums);
  const rows = accounts
    .map((account) => {
      const sum = totals.get(account.code) ?? { debitCents: 0, creditCents: 0 };
      const net = sum.debitCents - sum.creditCents;
      return { code: account.code, name: account.name, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 };
    })
    .filter((row) => row.debitCents !== 0 || row.creditCents !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  return { rows, debitCents: rows.reduce((sum, row) => sum + row.debitCents, 0), creditCents: rows.reduce((sum, row) => sum + row.creditCents, 0) };
}

export type ProfitAndLoss = { income: ReportLine[]; expenses: ReportLine[]; incomeCents: number; expenseCents: number; profitCents: number };

/** Income and expenses over the dates the sums cover, and what's left. */
export function profitAndLoss(accounts: readonly LedgerAccount[], sums: readonly AccountSums[]): ProfitAndLoss {
  const income = linesOf(accounts, sums, ["income"]);
  const expenses = linesOf(accounts, sums, ["expense"]);
  const incomeCents = total(income);
  const expenseCents = total(expenses);
  return { income, expenses, incomeCents, expenseCents, profitCents: incomeCents - expenseCents };
}

export type BalanceSheet = {
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  assetCents: number;
  liabilityCents: number;
  /** Equity accounts plus profit not yet closed into them. */
  equityCents: number;
  /** Profit from before this financial year, shown as retained. */
  priorProfitCents: number;
  /** Profit so far this financial year. */
  yearProfitCents: number;
};

/**
 * What the business owns and owes on a day. Profit isn't closed into equity
 * by journals: profit from before the financial year shows as retained
 * earnings, and this year's so far on a line of its own, so the sheet
 * balances (assets = liabilities + equity) at any date.
 */
export function balanceSheet(accounts: readonly LedgerAccount[], untilDate: readonly AccountSums[], beforeYear: readonly AccountSums[]): BalanceSheet {
  const assets = linesOf(accounts, untilDate, ["asset"]);
  const liabilities = linesOf(accounts, untilDate, ["liability"]);
  const equity = linesOf(accounts, untilDate, ["equity"]);
  const allProfit = profitAndLoss(accounts, untilDate).profitCents;
  const priorProfitCents = profitAndLoss(accounts, beforeYear).profitCents;
  const yearProfitCents = allProfit - priorProfitCents;
  return {
    assets,
    liabilities,
    equity,
    assetCents: total(assets),
    liabilityCents: total(liabilities),
    equityCents: total(equity) + allProfit,
    priorProfitCents,
    yearProfitCents,
  };
}

export const cashFlowGroups = ["guests", "expenses", "payroll-tax", "owner", "loans", "assets", "transfers", "other"] as const;
export type CashFlowGroup = (typeof cashFlowGroups)[number];

export const cashFlowGroupNames: Record<CashFlowGroup, string> = {
  guests: "From guests and channels",
  expenses: "Paid for running the guesthouse",
  "payroll-tax": "Wages, PAYE, UIF and SDL",
  owner: "Put in or taken out by the owner",
  loans: "Loans",
  assets: "Equipment and furniture",
  transfers: "Between your own accounts",
  other: "Other",
};

function groupOf(code: string): CashFlowGroup {
  const kind = kindOfCode(code);
  if (code.startsWith("11") || code.startsWith("12") || code === "2000" || code === "2300" || kind === "income") return "guests";
  if (code.startsWith("22") || code === "6000" || code === "6100") return "payroll-tax";
  if (kind === "expense") return "expenses";
  if (kind === "equity") return "owner";
  if (code === "2400") return "loans";
  if (code.startsWith("15")) return "assets";
  return "other";
}

export type CashFlow = { openingCents: number; closingCents: number; groups: { group: CashFlowGroup; name: string; inCents: number; outCents: number }[] };

/**
 * Cash in and out over the dates, by what it was for (the direct method):
 * each journal's change in cash (bank, cash on hand, gateway clearing) goes
 * to the group of its biggest line that isn't cash. A journal that only
 * moves money between cash accounts is a transfer.
 */
export function cashFlow(journals: readonly Journal[], openingCents: number): CashFlow {
  const groups = new Map<CashFlowGroup, { inCents: number; outCents: number }>(cashFlowGroups.map((group) => [group, { inCents: 0, outCents: 0 }]));
  let net = 0;
  for (const journal of journals) {
    const cashLines = journal.lines.filter((entry) => isCashAccount(entry.accountCode));
    const change = cashLines.reduce((sum, entry) => sum + entry.debitCents - entry.creditCents, 0);
    const others = journal.lines.filter((entry) => !isCashAccount(entry.accountCode));
    const biggest = [...others].sort((a, b) => b.debitCents + b.creditCents - (a.debitCents + a.creditCents))[0];
    const group: CashFlowGroup = biggest ? groupOf(biggest.accountCode) : "transfers";
    const slot = groups.get(group)!;
    if (change > 0) slot.inCents += change;
    else if (change < 0) slot.outCents += -change;
    else if (group === "transfers") {
      const moved = cashLines.reduce((sum, entry) => sum + entry.debitCents, 0);
      slot.inCents += moved;
      slot.outCents += moved;
    }
    net += change;
  }
  return {
    openingCents,
    closingCents: openingCents + net,
    groups: cashFlowGroups.map((group) => ({ group, name: cashFlowGroupNames[group], ...groups.get(group)! })).filter((row) => row.inCents !== 0 || row.outCents !== 0),
  };
}

/** The first day of the financial year `date` falls in, for a year ending with month `yearEndMonth` (1–12). */
export function financialYearStart(date: IsoDate, yearEndMonth: number): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startMonth = (yearEndMonth % 12) + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
}

/** The last day of the financial year that starts on `start`. */
export function financialYearEnd(start: IsoDate): IsoDate {
  const next = `${Number(start.slice(0, 4)) + 1}${start.slice(4)}`;
  return addDays(next, -1);
}
