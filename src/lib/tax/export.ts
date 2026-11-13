import type { LedgerAccount } from "@/lib/ledger/accounts";
import type { Journal } from "@/lib/ledger/journals";
import { describeValue, parameterCatalogue } from "./parameters";
import { disclaimer, returnKindNames, returnStatusNames, type TaxReturn } from "./returns";

/**
 * A return's export pack as CSV: the disclaimer, the return and its status,
 * its figures, the parameter versions it used (with their sars.gov.za
 * pages), and every journal line behind the figures, for the owner's
 * accountant. Amounts are plain decimals (1250.00) for spreadsheets.
 */

/** An amount as the CSV writes it: "1250.00", "-80.50". */
type Amount = { amount: string };

type Cell = string | number | null | Amount;

/** A cell, quoted where needed, with any text a spreadsheet would run as a formula made inert. Numbers and amounts are written as they are. */
export function csvCell(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return value.amount;
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

const rands = (cents: number): Amount => ({ amount: (cents / 100).toFixed(2) });

function row(...cells: Cell[]): string {
  return cells.map(csvCell).join(",");
}

/** The journals behind a return: those with a line on one of its figures' accounts. */
export function journalsBehind(taxReturn: Pick<TaxReturn, "figures">, journals: readonly Journal[]): Journal[] {
  const accounts = new Set(taxReturn.figures.accounts);
  return journals.filter((journal) => journal.lines.some((line) => accounts.has(line.accountCode)));
}

export function exportFileName(taxReturn: Pick<TaxReturn, "kind" | "periodStart" | "periodEnd">): string {
  return `${taxReturn.kind}-${taxReturn.periodStart}-to-${taxReturn.periodEnd}.csv`;
}

export function returnCsv(taxReturn: TaxReturn, journals: readonly Journal[], accounts: readonly LedgerAccount[]): string {
  const names = new Map(accounts.map((account) => [account.code, account.name]));
  const lines: string[] = [
    row(disclaimer),
    "",
    row("Return", returnKindNames[taxReturn.kind]),
    row("Period", taxReturn.periodStart, taxReturn.periodEnd),
    row("Status", returnStatusNames[taxReturn.status]),
    row("Due", taxReturn.dueOn),
    row("Filed on", taxReturn.filedOn),
    row("SARS reference", taxReturn.submissionReference),
    "",
    row("Figure", "Amount (R)"),
    ...taxReturn.figures.lines.map((line) => row(line.label, line.count ? line.cents : rands(line.cents))),
    "",
    ...taxReturn.figures.warnings.map((warning) => row("Check", warning)),
    ...taxReturn.figures.notes.map((note) => row("Note", note)),
    "",
    row("Parameter", "Version", "Value", "Source (sars.gov.za)", "Checked on"),
    ...taxReturn.parameters.map((parameter) =>
      row(parameterCatalogue[parameter.code]?.name ?? parameter.code, parameter.version, describeValue(parameter.code, parameter.value), parameter.sourceUrl, parameter.checkedOn),
    ),
    "",
    row("Journal date", "Journal", "Account", "Account name", "Debit (R)", "Credit (R)", "Line note"),
  ];
  for (const journal of journalsBehind(taxReturn, journals)) {
    for (const line of journal.lines) {
      lines.push(row(journal.date, journal.memo, line.accountCode, names.get(line.accountCode) ?? "", line.debitCents ? rands(line.debitCents) : null, line.creditCents ? rands(line.creditCents) : null, line.memo));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
