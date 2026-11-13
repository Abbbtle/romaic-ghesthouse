import { addDays, daysBetween, type IsoDate } from "@/lib/format/zoned-time";
import { systemAccounts } from "@/lib/ledger/accounts";
import type { Journal, JournalDraft, JournalLine } from "@/lib/ledger/journals";
import { clip } from "./expenses";
import type { StatementMapping } from "./statement";

/**
 * The owner's bank accounts, their statements and reconciling them with
 * the books. No bank is connected: statements are exported from online
 * banking as CSV and imported. Each statement line is then matched to a
 * journal already in the books (a guest's EFT posted from its money page,
 * an expense), or a journal is made from it (a channel's payout, bank
 * charges, the owner putting money in). Lines are never deleted.
 */

export type BankAccount = {
  id: string;
  /** The owner's name for it: "Business cheque". */
  name: string;
  bankName: string;
  /** Only the last four digits are ever shown; the number itself is kept encrypted. */
  accountNumberLast4: string;
  /** Its account in the chart (10xx). */
  ledgerCode: string;
  /** How its statements' columns are read, once the owner has said. */
  mapping: StatementMapping | null;
  createdAt: Date;
  createdBy: string | null;
};

export const bankLimits = {
  nameMax: 60,
  bankNameMax: 60,
  fileNameMax: 200,
  /** How far apart (in days) a line and a journal may be dated and still be suggested as a match. */
  matchWindowDays: 7,
  linesShown: 200,
} as const;

/** Where a bank account's number is sealed: decrypting it under any other account's id fails. */
export const accountNumberContext = (bankAccountId: string) => `bank-account:${bankAccountId}`;

/**
 * The codes new bank accounts get in the chart, in order: the first
 * account can be 1000 ("Bank"), the rest 1001–1009, then 1030–1099 (1010
 * and 1020 are cash on hand and the gateway's clearing account).
 */
export const bankLedgerCodes: readonly string[] = [
  ...Array.from({ length: 9 }, (_, index) => String(1001 + index)),
  ...Array.from({ length: 70 }, (_, index) => String(1030 + index)),
];

export type BankImport = {
  id: string;
  bankAccountId: string;
  fileName: string;
  importedAt: Date;
  importedBy: string | null;
  /** Lines read from the file. */
  rowCount: number;
  /** New lines kept. */
  addedCount: number;
  /** Lines already there from an earlier import. */
  duplicateCount: number;
  /** Rows that couldn't be read. */
  skippedCount: number;
};

export const matchKinds = ["existing", "created"] as const;
/** existing: a journal already in the books; created: a journal made from the line. */
export type MatchKind = (typeof matchKinds)[number];

export type LineMatch = { journalId: string; kind: MatchKind; at: Date; by: string | null };

export type BankLine = {
  id: string;
  bankAccountId: string;
  importId: string;
  date: IsoDate;
  description: string;
  /** Money in is positive, money out negative. */
  amountCents: number;
  balanceCents: number | null;
  /** Stops the same line being kept twice when statements overlap. */
  dedupeHash: string;
  /** Its row in the file it came from. */
  rowNumber: number;
  match: LineMatch | null;
  /**
   * Whether the matched journal has since been reversed (an expense voided,
   * a journal reversed by hand), read from the ledger: the line is then to
   * reconcile again.
   */
  matchReversed: boolean;
  /** How many journals have been made from it (each unmatch reverses one), for their sources. */
  journalsMade: number;
};

export type LineStatus = "unmatched" | "matched" | "reversed";

export function lineStatus(line: Pick<BankLine, "match" | "matchReversed">): LineStatus {
  if (!line.match) return "unmatched";
  return line.matchReversed ? "reversed" : "matched";
}

/** Whether a line still needs reconciling: never matched, or its journal was reversed. */
export function toReconcile(line: Pick<BankLine, "match" | "matchReversed">): boolean {
  return lineStatus(line) !== "matched";
}

/** What a journal made from a line is for. */
export const lineKinds = ["channel-payout", "owner", "bank-charges", "transfer", "other"] as const;
export type LineKind = (typeof lineKinds)[number];

export const lineKindNames: Record<LineKind, string> = {
  "channel-payout": "A channel's payout",
  owner: "The owner's own money",
  "bank-charges": "Bank charges",
  transfer: "A transfer between your accounts",
  other: "Another account",
};

/** The other side of a line's journal for kinds that need no choosing: owner's capital in, drawings out, and bank charges. */
export function fixedCounterAccount(kind: LineKind, amountCents: number): string | null {
  if (kind === "owner") return amountCents > 0 ? systemAccounts.ownersCapital : systemAccounts.drawings;
  if (kind === "bank-charges") return systemAccounts.bankCharges;
  return null;
}

const entry = (accountCode: string, side: "debit" | "credit", cents: number): JournalLine => ({
  accountCode,
  debitCents: side === "debit" ? cents : 0,
  creditCents: side === "credit" ? cents : 0,
  party: null,
  memo: null,
});

/** The source of the `sequence`th journal made from a line (the first is "matched"). */
export function madeSource(lineId: string, sequence: number): JournalDraft["source"] {
  return { type: "bank-line", id: lineId, part: sequence === 1 ? "matched" : `matched:${sequence}` };
}

/** The source of the reversal of the `sequence`th journal made from a line, when it's unmatched. */
export function unmatchSource(lineId: string, sequence: number): JournalDraft["source"] {
  return { type: "bank-line", id: lineId, part: `unmatched:${sequence}` };
}

/**
 * A journal made from a statement line, on the line's date: money in
 * debits the bank account and credits `counterCode`; money out the other
 * way round.
 */
export function lineDraft(line: BankLine, bankCode: string, counterCode: string, kind: LineKind, sequence: number): JournalDraft {
  const cents = Math.abs(line.amountCents);
  const moneyIn = line.amountCents > 0;
  return {
    date: line.date,
    memo: clip(`${lineKindNames[kind]}: ${line.description}`, 300),
    source: madeSource(line.id, sequence),
    lines: moneyIn ? [entry(bankCode, "debit", cents), entry(counterCode, "credit", cents)] : [entry(counterCode, "debit", cents), entry(bankCode, "credit", cents)],
  };
}

/** What a journal does to one account: its debits less its credits there (money in, for a bank account). */
export function netOn(journal: Pick<Journal, "lines">, accountCode: string): number {
  return journal.lines.filter((line) => line.accountCode === accountCode).reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
}

/** The dates a line's matches may fall in. */
export function matchWindow(date: IsoDate): { from: IsoDate; until: IsoDate } {
  return { from: addDays(date, -bankLimits.matchWindowDays), until: addDays(date, bankLimits.matchWindowDays) };
}

/**
 * Journals that could be a line: on its bank account, moving the same
 * amount the same way, within a week either side, neither a reversal nor
 * reversed, and not matched to another line. Closest dates first.
 */
export function rankMatches(line: Pick<BankLine, "date" | "amountCents">, bankCode: string, journals: readonly Journal[], unavailable: ReadonlySet<string>): Journal[] {
  const { from, until } = matchWindow(line.date);
  return journals
    .filter((journal) => journal.date >= from && journal.date <= until && !journal.reversalOf && !unavailable.has(journal.id) && netOn(journal, bankCode) === line.amountCents)
    .sort((a, b) => Math.abs(daysBetween(line.date, a.date)) - Math.abs(daysBetween(line.date, b.date)) || a.date.localeCompare(b.date));
}

/**
 * The statement's closing balance from the lines of its last day that carry
 * one. Lines on one day can come in either order, so the last is the one
 * whose balance isn't where another of that day's lines started from (its
 * balance less its amount). Null when no line has a balance.
 */
export function closingBalance(lines: readonly Pick<BankLine, "date" | "amountCents" | "balanceCents" | "rowNumber">[]): { date: IsoDate; balanceCents: number } | null {
  const withBalance = lines.filter((line): line is typeof line & { balanceCents: number } => line.balanceCents !== null);
  if (withBalance.length === 0) return null;
  const lastDay = withBalance.reduce((latest, line) => (line.date > latest ? line.date : latest), withBalance[0]!.date);
  const day = withBalance.filter((line) => line.date === lastDay);
  const enders = day.filter((line) => !day.some((other) => other !== line && other.balanceCents - other.amountCents === line.balanceCents));
  // Balances that repeat in a day leave it open: the file's last row of the day is the best guess.
  const last = (enders.length === 1 ? enders : day).reduce((best, line) => (line.rowNumber > best.rowNumber ? line : best));
  return { date: lastDay, balanceCents: last.balanceCents };
}

/** "••1234". */
export function maskedNumber(last4: string): string {
  return `••${last4}`;
}

/** Digits only, from an account number as typed ("62 1234 5678", "62-1234-5678"). */
export function accountNumberDigits(value: string): string {
  return value.replace(/[\s-]/g, "");
}
