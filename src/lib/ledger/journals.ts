import type { IsoDate } from "@/lib/format/zoned-time";
import type { LedgerAccount } from "./accounts";

/**
 * Journals: double entry in integer cents. A posted journal never changes; a
 * mistake is corrected by its reversal (the same lines, sides swapped) and a
 * new journal. Every journal balances: its debits equal its credits.
 */

/** A month of the books, "2026-11": the unit periods are locked in. */
export type Period = string;

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export type JournalLine = {
  accountCode: string;
  /** Exactly one of debit and credit is above zero. */
  debitCents: number;
  creditCents: number;
  /** Whose balance it is, for the accounts that keep one per person or booking: "booking:<id>", "supplier:<id>". */
  party: string | null;
  memo: string | null;
};

/** Where an automatic journal came from: one journal per source, so posting again does nothing. */
export type JournalSource = { type: string; id: string; part: string };

export type Journal = {
  id: string;
  date: IsoDate;
  period: Period;
  memo: string;
  source: JournalSource | null;
  /** The journal this one reverses. */
  reversalOf: string | null;
  /** Who posted it; null for the system. */
  postedBy: string | null;
  postedAt: Date;
  lines: JournalLine[];
};

/** A journal as it's asked for, before it has an id, a period or a time. */
export type JournalDraft = {
  date: IsoDate;
  memo: string;
  source: JournalSource | null;
  reversalOf?: string | null;
  lines: JournalLine[];
};

export const journalLimits = { memoMax: 300, lineMemoMax: 200, maxLines: 40, maxLineCents: 2_000_000_000 } as const;

export type DraftProblem =
  | { kind: "too-few-lines" }
  | { kind: "too-many-lines" }
  | { kind: "bad-amount"; line: number }
  | { kind: "unknown-account"; line: number }
  | { kind: "inactive-account"; line: number }
  | { kind: "unbalanced"; debitCents: number; creditCents: number };

export function totalsOf(lines: readonly Pick<JournalLine, "debitCents" | "creditCents">[]): { debitCents: number; creditCents: number } {
  return lines.reduce((sum, line) => ({ debitCents: sum.debitCents + line.debitCents, creditCents: sum.creditCents + line.creditCents }), { debitCents: 0, creditCents: 0 });
}

/** What's wrong with a draft, checked against the chart, or null when it can be posted. */
export function draftProblem(draft: Pick<JournalDraft, "lines">, accounts: ReadonlyMap<string, LedgerAccount>): DraftProblem | null {
  if (draft.lines.length < 2) return { kind: "too-few-lines" };
  if (draft.lines.length > journalLimits.maxLines) return { kind: "too-many-lines" };
  for (const [index, line] of draft.lines.entries()) {
    const amounts = [line.debitCents, line.creditCents];
    const valid = amounts.every((amount) => Number.isInteger(amount) && amount >= 0 && amount <= journalLimits.maxLineCents);
    if (!valid || (line.debitCents > 0) === (line.creditCents > 0)) return { kind: "bad-amount", line: index };
    const account = accounts.get(line.accountCode);
    if (!account) return { kind: "unknown-account", line: index };
    if (!account.active) return { kind: "inactive-account", line: index };
  }
  const totals = totalsOf(draft.lines);
  if (totals.debitCents !== totals.creditCents) return { kind: "unbalanced", ...totals };
  return null;
}

/** The lines that undo `lines`: each side swapped. */
export function reversedLines(lines: readonly JournalLine[]): JournalLine[] {
  return lines.map((line) => ({ ...line, debitCents: line.creditCents, creditCents: line.debitCents }));
}

/** A journal's size: its total debits (which equal its credits). */
export function journalAmount(journal: Pick<Journal, "lines">): number {
  return totalsOf(journal.lines).debitCents;
}

/** "booking:<id>". */
export function bookingParty(bookingId: string): string {
  return `booking:${bookingId}`;
}
