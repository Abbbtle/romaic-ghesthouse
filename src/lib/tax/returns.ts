import { formatMonthSpan } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import type { IsoDate } from "@/lib/format/zoned-time";
import { systemAccounts, type LedgerAccount } from "@/lib/ledger/accounts";
import type { AccountSums } from "@/lib/ledger/ports";
import { normalBalance } from "@/lib/ledger/reports";
import { checkPayroll, type Employee, type PayrollRun } from "./payroll";
import { percentOf, taxOnTable, type ParameterCode, type TaxParameter, type TaxTable } from "./parameters";
import { monthOf, monthsBetween, type ProvisionalPayment } from "./periods";
import type { LegalForm } from "./registrations";

/**
 * Returns prepared from the books for the owner or their accountant to
 * check and file on SARS eFiling. Nothing is filed from this app. A return
 * goes draft → reviewed → filed; filing records the date and the proof of
 * submission and locks its months in the books. Its figures are fixed when
 * it's prepared (and can be refreshed while it's a draft), along with the
 * parameter versions they used.
 */

export const disclaimer = "These figures are prepared from the books for review by the owner or their accountant. Nothing is filed from this app.";

export const returnKinds = ["vat201", "turnover", "irp6", "emp201"] as const;
export type ReturnKind = (typeof returnKinds)[number];

export const returnKindNames: Record<ReturnKind, string> = {
  vat201: "VAT201",
  turnover: "Turnover tax",
  irp6: "Provisional tax (IRP6)",
  emp201: "EMP201",
};

export const returnStatuses = ["draft", "reviewed", "filed"] as const;
export type ReturnStatus = (typeof returnStatuses)[number];

export const returnStatusNames: Record<ReturnStatus, string> = { draft: "Draft", reviewed: "Reviewed", filed: "Filed" };

/** One figure on a return: what it is and the amount in cents (or, for a count such as employees paid, the number itself). */
export type FigureLine = { key: string; label: string; cents: number; strong?: boolean; count?: boolean };

export type ReturnFigures = {
  lines: FigureLine[];
  /** Things to know about how the figures were made. */
  notes: string[];
  /** Things to check before relying on them. */
  warnings: string[];
  /** The ledger accounts the figures come from: the journals behind them are those with a line on one of these. */
  accounts: string[];
  /** For an IRP6: which payment it is. */
  payment?: ProvisionalPayment;
};

/** A parameter version a return used, as it was then. */
export type UsedParameter = { code: ParameterCode; version: number; value: unknown; sourceUrl: string; checkedOn: IsoDate };

export function usedParameter(parameter: TaxParameter): UsedParameter {
  return { code: parameter.code, version: parameter.version, value: parameter.value, sourceUrl: parameter.sourceUrl, checkedOn: parameter.checkedOn };
}

export type TaxReturn = {
  id: string;
  kind: ReturnKind;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** "VAT201 · Jan – Feb 2027". */
  label: string;
  status: ReturnStatus;
  figures: ReturnFigures;
  parameters: UsedParameter[];
  /** When it's due (eFiling, where SARS gives two dates). */
  dueOn: IsoDate | null;
  preparedAt: Date;
  preparedBy: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  filedOn: IsoDate | null;
  filedAt: Date | null;
  filedBy: string | null;
  proofFileId: string | null;
  /** SARS's reference for the submission, if the owner noted it. */
  submissionReference: string | null;
  createdAt: Date;
};

/** The parameters each kind of return can't be prepared without, and the dates in its period they must cover. */
export const returnRequirements: Record<ReturnKind, { code: ParameterCode; at: "end" | "start-and-end" }[]> = {
  vat201: [
    { code: "vat.standard-rate", at: "start-and-end" },
    { code: "vat.filing-categories", at: "end" },
    { code: "vat.return-due", at: "end" },
  ],
  turnover: [
    { code: "turnover.rate-table", at: "end" },
    { code: "turnover.threshold", at: "end" },
  ],
  irp6: [{ code: "provisional.periods", at: "end" }],
  emp201: [{ code: "paye.emp201-due", at: "end" }],
};

/** The returns that can't be prepared without a verified `code`: what an unverified one blocks. */
export function returnsNeeding(code: ParameterCode): ReturnKind[] {
  return returnKinds.filter((kind) => returnRequirements[kind].some((requirement) => requirement.code === code));
}

/** "A", "A and B", "A, B and C". */
function inWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What a rate or date that isn't verified stops, as a sentence: "VAT201 returns are refused until it's verified." */
export function whatItBlocks(code: ParameterCode): string {
  const kinds = returnsNeeding(code);
  if (kinds.length === 0) return "No return needs it, so none is refused.";
  return `${inWords(kinds.map((kind) => returnKindNames[kind]))} returns are refused until it's verified.`;
}

/** "VAT201 · Jan – Feb 2027", "EMP201 · Nov 2026", "IRP6 first payment · year to Feb 2027". */
export function returnLabel(kind: ReturnKind, periodStart: IsoDate, periodEnd: IsoDate, payment?: ProvisionalPayment): string {
  const span = formatMonthSpan(monthOf(periodStart), monthOf(periodEnd));
  switch (kind) {
    case "vat201":
      return `VAT201 · ${span}`;
    case "emp201":
      return `EMP201 · ${span}`;
    case "turnover":
      return `Turnover tax · ${span}`;
    case "irp6":
      return `IRP6 ${payment === "second" ? "second" : "first"} payment · ${span}`;
  }
}

// --- figures from the books ------------------------------------------------------------

type Books = { accounts: readonly LedgerAccount[]; sums: readonly AccountSums[] };

function balanceOf(books: Books, code: string): number {
  const account = books.accounts.find((candidate) => candidate.code === code);
  const sum = books.sums.find((candidate) => candidate.accountCode === code);
  if (!account || !sum) return 0;
  return normalBalance(account.kind, sum);
}

function totalOf(books: Books, kind: "income" | "expense"): number {
  return books.accounts.filter((account) => account.kind === kind).reduce((total, account) => total + balanceOf(books, account.code), 0);
}

function codesOf(books: Books, kind: "income" | "expense"): string[] {
  return books.accounts.filter((account) => account.kind === kind).map((account) => account.code);
}

/**
 * A VAT201's figures: income, the VAT the books hold (output and input), and
 * the VAT that income would include if all of it were standard-rated, at the
 * verified rate. The accountant maps them to the return's fields.
 */
export function vatFigures(books: Books, ratePercent: number, longStayVerified: boolean): ReturnFigures {
  const income = totalOf(books, "income");
  const output = balanceOf(books, systemAccounts.vatOutput);
  const input = balanceOf(books, systemAccounts.vatInput);
  const included = Math.round((income * ratePercent) / (100 + ratePercent));
  const warnings: string[] = [];
  if (income > 0 && output === 0) {
    warnings.push("The books hold no output VAT for this period: VAT isn't being posted yet (the VAT accounts are switched off). Ask your accountant how to treat this period.");
  }
  return {
    lines: [
      { key: "income", label: "Income in the books (accommodation and other)", cents: income },
      { key: "vat-included", label: `VAT included in that income if all of it is standard-rated (${ratePercent}%)`, cents: included },
      { key: "output", label: "Output VAT in the books", cents: output },
      { key: "input", label: "Input VAT in the books", cents: input },
      { key: "payable", label: "VAT payable from the books (output less input)", cents: output - input, strong: true },
    ],
    notes: [
      "The figures aren't mapped to the VAT201's field numbers: your accountant does that on eFiling.",
      longStayVerified
        ? "Long stays may be valued differently for VAT: see 'VAT on long stays' under Rates and dates."
        : "Long stays may be valued differently for VAT, and that rule isn't verified on sars.gov.za yet: check stays of more than 28 days with your accountant.",
    ],
    warnings,
    accounts: [...codesOf(books, "income"), systemAccounts.vatOutput, systemAccounts.vatInput],
  };
}

/** A turnover tax return's figures: the year's turnover from the books and the tax on it under the verified table. */
export function turnoverFigures(books: Books, table: TaxTable, thresholdCents: number): ReturnFigures {
  const turnover = totalOf(books, "income");
  const warnings = turnover > thresholdCents ? [`Turnover of ${formatCents(turnover)} is over the turnover tax threshold of ${formatCents(thresholdCents)}: the business may no longer qualify. Speak to your accountant.`] : [];
  return {
    lines: [
      { key: "turnover", label: "Taxable turnover from the books", cents: turnover },
      { key: "tax", label: "Turnover tax on it", cents: taxOnTable(table, turnover), strong: true },
    ],
    notes: ["Turnover is all income in the books for the year. Your accountant confirms what counts as qualifying turnover."],
    warnings,
    accounts: codesOf(books, "income"),
  };
}

/** How the IRP6 estimate is worked out, when it can be: the tables it needs, or why it's left off. */
export type TaxEstimateBasis =
  | { status: "estimate"; legalForm: LegalForm; table: TaxTable | null; ratePercent: number | null; rebateCents: number; parameters: TaxParameter[] }
  | { status: "left-off"; reason: string };

/** The tax on a year's estimated taxable income, for the legal form the basis is for. */
export function estimateTax(basis: Extract<TaxEstimateBasis, { status: "estimate" }>, taxableCents: number): number {
  if (taxableCents <= 0) return 0;
  if (basis.table) return Math.max(0, taxOnTable(basis.table, taxableCents) - basis.rebateCents);
  return percentOf(taxableCents, basis.ratePercent ?? 0);
}

/**
 * An IRP6 worksheet: profit in the books for the year so far, an estimate
 * for the whole year (scaled up from the months so far), and, when the
 * legal form is set and its tables are verified, the tax on that estimate
 * and this payment's share: half for the first, the rest for the second.
 */
export function provisionalFigures(
  books: Books,
  input: { yearStart: IsoDate; asOf: IsoDate; payment: ProvisionalPayment; basis: TaxEstimateBasis; firstPaymentCents: number | null },
): ReturnFigures {
  const income = totalOf(books, "income");
  const expenses = totalOf(books, "expense");
  const profit = income - expenses;
  const months = Math.min(12, monthsBetween(input.yearStart, input.asOf).length);
  const estimate = Math.round((profit * 12) / Math.max(1, months));
  const lines: FigureLine[] = [
    { key: "income", label: "Income in the books, year so far", cents: income },
    { key: "expenses", label: "Expenses in the books, year so far", cents: expenses },
    { key: "profit", label: `Profit, year so far (${months} ${months === 1 ? "month" : "months"})`, cents: profit },
    { key: "estimate", label: "Estimated taxable income for the year", cents: estimate, strong: true },
  ];
  const notes = [
    "The estimate scales the year so far up to twelve months. Profit in the books isn't taxable income: your accountant adjusts it (allowances, items that aren't deductible, other income).",
  ];
  const warnings: string[] = [];
  if (input.basis.status === "estimate") {
    const tax = estimateTax(input.basis, estimate);
    lines.push({ key: "tax", label: "Estimated tax for the year", cents: tax });
    if (input.payment === "first") {
      lines.push({ key: "payment", label: "First payment (half the year's estimate)", cents: Math.round(tax / 2), strong: true });
    } else {
      const first = input.firstPaymentCents ?? 0;
      lines.push({ key: "first-payment", label: "Less the first payment", cents: first });
      lines.push({ key: "payment", label: "Second payment", cents: Math.max(0, tax - first), strong: true });
      if (input.firstPaymentCents === null) warnings.push("No first IRP6 for this year is in the app, so nothing is taken off for the first payment.");
    }
    if (input.basis.legalForm === "sole-proprietor") notes.push("The estimate takes off the primary rebate only, and ignores the owner's other income.");
    if (input.basis.legalForm === "small-business-corporation") notes.push("Small business corporation rates apply only if the company qualifies: your accountant confirms it.");
  } else {
    notes.push(`No tax estimate: ${input.basis.reason}`);
  }
  return { lines, notes, warnings, accounts: [...codesOf(books, "income"), ...codesOf(books, "expense")], payment: input.payment };
}

/** An EMP201's figures: the month's recorded payroll, totalled, with the UIF and SDL checks. */
export function emp201Figures(runs: readonly PayrollRun[], employees: readonly Employee[], parameters: readonly TaxParameter[], sdlRegistered: boolean): ReturnFigures {
  const counted = runs.filter((run) => run.voidedAt === null);
  const sum = (pick: (run: PayrollRun) => number) => counted.reduce((total, run) => total + pick(run), 0);
  const paye = sum((run) => run.payeCents);
  const uif = sum((run) => run.uifEmployeeCents + run.uifEmployerCents);
  const sdl = sum((run) => run.sdlCents);
  const warnings: string[] = [];
  for (const run of counted) {
    const name = employees.find((employee) => employee.id === run.employeeId)?.name ?? "An employee";
    for (const warning of checkPayroll(parameters, run, sdlRegistered).warnings) warnings.push(`${name}: ${warning}`);
  }
  if (counted.length === 0) warnings.push("No pay is recorded for this month. If nobody was paid, the EMP201 may still be due: check with your accountant.");
  return {
    lines: [
      { key: "employees", label: "Employees paid", cents: counted.length, count: true },
      { key: "gross", label: "Gross pay", cents: sum((run) => run.grossCents) },
      { key: "paye", label: "PAYE", cents: paye },
      { key: "uif", label: "UIF (employee and employer)", cents: uif },
      { key: "sdl", label: "SDL", cents: sdl },
      { key: "total", label: "Total to pay SARS", cents: paye + uif + sdl, strong: true },
    ],
    notes: ["From the pay recorded under Payroll for this month. The app doesn't work out PAYE: it totals what was recorded."],
    warnings,
    accounts: [systemAccounts.salaries, systemAccounts.employerUifSdl, systemAccounts.payePayable, systemAccounts.uifPayable, systemAccounts.sdlPayable],
  };
}

/** A figure as the pages and the export show it: money as "R1,250", a count as a number. */
export function figureText(line: FigureLine): string {
  return line.count ? String(line.cents) : formatCents(line.cents);
}
