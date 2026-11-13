import { formatMonth } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { addMonths, type IsoDate } from "@/lib/format/zoned-time";
import { systemAccounts } from "@/lib/ledger/accounts";
import type { JournalDraft, JournalLine } from "@/lib/ledger/journals";
import { lookUp, percentOf, type TaxParameter } from "./parameters";
import { firstDayOf, lastDayOf, monthOf, monthsBetween, type Month } from "./periods";

/**
 * Payroll as recorded: employees, and each month's pay as the owner (or
 * their payroll provider) worked it out. The app doesn't calculate PAYE: it
 * records what was paid, posts it to the books, totals it for the EMP201,
 * and warns (never blocks) when the UIF or SDL recorded differs from what the
 * verified parameters give.
 */

export type Employee = {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  active: boolean;
  /** The tax number's last digits; the number itself is kept encrypted. */
  taxNumberLast4: string | null;
  createdAt: Date;
  createdBy: string | null;
};

/** An employee as stored, with the tax number sealed (bound to the employee's id). */
export type EmployeeRecord = Employee & { taxNumberSealed: string | null };

export type PayrollAmounts = {
  grossCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  uifEmployerCents: number;
  sdlCents: number;
  /** Gross less PAYE and the employee's UIF: what reached the employee. */
  netCents: number;
};

export type PayrollRun = PayrollAmounts & {
  id: string;
  employeeId: string;
  /** The month the pay is for: "2026-11". */
  period: Month;
  paidOn: IsoDate;
  /** The journal that posted it, and the one that undid it if it was voided. */
  journalId: string | null;
  reversalJournalId: string | null;
  recordedAt: Date;
  recordedBy: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
};

export const payrollSourceType = "payroll-run";

/** Net pay as the books need it: gross less PAYE and the employee's UIF (no other deductions are kept). */
export function netPay(amounts: Pick<PayrollAmounts, "grossCents" | "payeCents" | "uifEmployeeCents">): number {
  return amounts.grossCents - amounts.payeCents - amounts.uifEmployeeCents;
}

const line = (accountCode: string, side: "debit" | "credit", cents: number, memo: string | null = null): JournalLine => ({
  accountCode,
  debitCents: side === "debit" ? cents : 0,
  creditCents: side === "credit" ? cents : 0,
  party: null,
  memo,
});

/**
 * The journal for a month's pay: gross to salaries, the employer's UIF and
 * SDL to their expense, what's owed to SARS to PAYE, UIF and SDL payable,
 * and the net pay out of the main bank. Lines of nothing are left out.
 */
export function payrollDraft(run: Pick<PayrollRun, "id" | "period" | "paidOn"> & PayrollAmounts, employeeName: string, mainBank: string): JournalDraft {
  const employerCosts = run.uifEmployerCents + run.sdlCents;
  const lines = [
    line(systemAccounts.salaries, "debit", run.grossCents),
    line(systemAccounts.employerUifSdl, "debit", employerCosts),
    line(systemAccounts.payePayable, "credit", run.payeCents),
    line(systemAccounts.uifPayable, "credit", run.uifEmployeeCents + run.uifEmployerCents),
    line(systemAccounts.sdlPayable, "credit", run.sdlCents),
    line(mainBank, "credit", run.netCents, "Net pay"),
  ].filter((entry) => entry.debitCents > 0 || entry.creditCents > 0);
  return { date: run.paidOn, memo: payMemo(run.period, employeeName), source: { type: payrollSourceType, id: run.id, part: "recorded" }, lines };
}

/** A pay journal's memo: "October 2026 pay: Lerato Dube", or "October 2026 pay" without a name. */
export function payMemo(period: Month, employeeName?: string): string {
  return employeeName ? `${formatMonth(period)} pay: ${employeeName}` : `${formatMonth(period)} pay`;
}

/** The months pay can be recorded for, newest first: this month and the twelve before it (a whole tax year back, whatever the month). */
export function payMonths(today: IsoDate): Month[] {
  return monthsBetween(addMonths(firstDayOf(monthOf(today)), -12), today).reverse();
}

/** What UIF and SDL the verified parameters give for a month's pay, and how the recorded amounts compare. */
export type PayrollCheck = { warnings: string[] };

/** Differences under a rand are rounding, not worth a warning. */
const tolerance = 100;

/**
 * Checks a run's UIF and SDL against the parameters for its month: UIF at
 * the verified rates on pay up to the verified ceiling, SDL at the verified
 * rate when the business is registered for it. Warnings only: the owner's
 * payroll provider may know better (an employee exempt from UIF, say).
 */
export function checkPayroll(parameters: readonly TaxParameter[], run: Pick<PayrollRun, "period"> & PayrollAmounts, sdlRegistered: boolean): PayrollCheck {
  const on = lastDayOf(run.period);
  const warnings: string[] = [];
  const rates = lookUp(parameters, "uif.rates", on);
  const ceiling = lookUp(parameters, "uif.ceiling", on);
  if (rates.status === "verified" && ceiling.status === "verified") {
    const pay = Math.min(run.grossCents, ceiling.value);
    const employee = percentOf(pay, rates.value.employeePercent);
    const employer = percentOf(pay, rates.value.employerPercent);
    if (Math.abs(employee - run.uifEmployeeCents) > tolerance) {
      warnings.push(`The employee's UIF is ${formatCents(run.uifEmployeeCents)}; ${rates.value.employeePercent}% of pay up to ${formatCents(ceiling.value)} gives ${formatCents(employee)}.`);
    }
    if (Math.abs(employer - run.uifEmployerCents) > tolerance) {
      warnings.push(`The employer's UIF is ${formatCents(run.uifEmployerCents)}; ${rates.value.employerPercent}% of pay up to ${formatCents(ceiling.value)} gives ${formatCents(employer)}.`);
    }
  } else {
    warnings.push(`UIF couldn't be checked: ${(rates.status === "missing" ? rates : ceiling.status === "missing" ? ceiling : null)?.message ?? ""}`.trim());
  }
  if (sdlRegistered) {
    const rate = lookUp(parameters, "sdl.rate", on);
    if (rate.status === "verified") {
      const expected = percentOf(run.grossCents, rate.value);
      if (Math.abs(expected - run.sdlCents) > tolerance) warnings.push(`SDL is ${formatCents(run.sdlCents)}; ${rate.value}% of pay gives ${formatCents(expected)}.`);
    } else {
      warnings.push(`SDL couldn't be checked: ${rate.message}`);
    }
  } else if (run.sdlCents > 0) {
    warnings.push("SDL is recorded, but no SDL registration is. Record it under Registrations if the business is registered.");
  }
  return { warnings };
}
