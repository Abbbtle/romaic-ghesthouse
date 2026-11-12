import type { IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { LedgerAccount } from "@/lib/ledger/accounts";
import type { Journal, JournalDraft, Period } from "@/lib/ledger/journals";
import type { SystemPosting, SystemPostResult } from "@/lib/ledger/ledger-service";
import type { AccountSums, JournalFilter } from "@/lib/ledger/ports";
import type { BankAccount, BankImport, BankLine, LineMatch } from "./bank";
import type { Expense, Supplier } from "./expenses";
import type { StatementMapping } from "./statement";

/**
 * What bookkeeping needs from the outside world. Adapters implement the
 * stores (Postgres; in-memory ones in ./testing); src/server wires them in
 * with the ledger. Every write is one atomic command, and nothing financial
 * can be deleted.
 */

export type ExpenseFilter = {
  from?: IsoDate;
  until?: IsoDate;
  supplierId?: string;
  accountCode?: string;
  limit: number;
};

export interface ExpenseStore {
  suppliers(): Promise<Supplier[]>;
  supplier(id: string): Promise<Supplier | null>;
  /** The supplier with this name, whatever its capitals and spaces. */
  supplierByName(name: string): Promise<Supplier | null>;
  /** Refused when another supplier has the name (ignoring capitals and spaces). */
  addSupplier(supplier: Supplier): Promise<"added" | "name-taken">;
  changeSupplier(id: string, change: { name: string; notes: string | null }): Promise<"changed" | "name-taken" | "missing">;

  addExpense(expense: Expense): Promise<void>;
  expense(id: string): Promise<Expense | null>;
  /** Newest first (by date, then when recorded). */
  expenses(filter: ExpenseFilter): Promise<Expense[]>;
  /** Notes the journal that posted it; false when it already has one. */
  setJournal(id: string, journalId: string): Promise<boolean>;
  /** Voids an expense that isn't voided yet; false when there's none, or it's voided. */
  voidExpense(id: string, at: Date, by: string, reason: string): Promise<boolean>;
  /** Notes the journal that reversed it; false when it isn't voided or already has one. */
  setVoidJournal(id: string, journalId: string): Promise<boolean>;
  /** Keeps a receipt with an expense that has none and isn't voided; false otherwise. */
  attachReceipt(id: string, fileId: string): Promise<boolean>;
}

/** unmatched: lines to reconcile (never matched, or matched to a journal since reversed). */
export type LineFilter = { status: "all" | "unmatched" | "matched"; limit: number };

export type ImportOutcome = { added: number; duplicates: number };

export interface BankStore {
  accounts(): Promise<BankAccount[]>;
  account(id: string): Promise<BankAccount | null>;
  /** Stores an account with its number sealed. Refused when another account already uses its ledger account. */
  addAccount(account: BankAccount, sealedNumber: string): Promise<"added" | "ledger-taken">;
  /** Saves how the account's statements are read; false when there's no such account. */
  saveMapping(id: string, mapping: StatementMapping): Promise<boolean>;

  /**
   * Stores an import and the lines in it that aren't there yet (by dedupe
   * hash, per account), all at once, with one import of an account at a
   * time. The import's counts are worked out as it's stored.
   */
  recordImport(entry: Omit<BankImport, "addedCount" | "duplicateCount">, lines: BankLine[]): Promise<ImportOutcome>;
  imports(bankAccountId: string, limit: number): Promise<BankImport[]>;

  /** Newest first (by date, then row). */
  lines(bankAccountId: string, filter: LineFilter): Promise<BankLine[]>;
  line(id: string): Promise<BankLine | null>;
  /** Lines on the account's last day with a balance, for the statement's closing balance. */
  lastBalancedLines(bankAccountId: string): Promise<BankLine[]>;
  /** How many lines the account has, and how many are to reconcile. */
  lineCounts(bankAccountId: string): Promise<{ lines: number; unmatched: number }>;
  /** The day of the account's earliest imported line: where its statements begin. Null with none. */
  firstLineDate(bankAccountId: string): Promise<IsoDate | null>;
  /**
   * Of these journals, the ones matched to a line of this account, with the
   * line's id. (A transfer between two of the owner's accounts is one
   * journal matched to a line on each.)
   */
  matchedJournals(bankAccountId: string, journalIds: readonly string[]): Promise<Map<string, string>>;
  /**
   * Sets or clears a line's match, if its match is still `expectedJournalId`
   * (null for none), so two people matching at once can't both win. A
   * journal matched to another line of the same account is refused. `journalsMade`, when given,
   * raises the count of journals made from the line to at least that.
   */
  setMatch(lineId: string, expectedJournalId: string | null, match: LineMatch | null, journalsMade?: number): Promise<"set" | "changed" | "journal-taken">;
}

/**
 * The ledger as bookkeeping uses it: posting through the ledger service
 * (one journal per source; a locked month refused or moved, as it decides),
 * the chart, and reading journals. No permission checks here: bookkeeping
 * checks its own before it calls.
 */
export interface BooksLedger {
  today(): IsoDate;
  postSystem(draft: JournalDraft, posting: SystemPosting): Promise<SystemPostResult>;
  periodLocked(period: Period): Promise<boolean>;
  activeAccounts(): Promise<LedgerAccount[]>;
  /** Every account in the chart, switched off or not, to name old records. */
  chartAccounts(): Promise<LedgerAccount[]>;
  addSystemAccount(account: LedgerAccount): Promise<"added" | "exists">;
  sumsFor(range: { from?: IsoDate; until?: IsoDate }): Promise<AccountSums[]>;
  journal(id: string): Promise<Journal | null>;
  reversalOf(id: string): Promise<Journal | null>;
  journals(filter: JournalFilter): Promise<Journal[]>;
}

/** Seals a bank account's number at rest, bound to its account (src/server passes the field cipher). */
export interface SecretSealer {
  seal(secret: string, context: string): string;
}

export type BookkeepingPermission = "expenses:manage" | "bank:manage";

export interface BookkeepingAccess {
  can(actor: Actor, permission: BookkeepingPermission): boolean;
  assertCan(actor: Actor, permission: BookkeepingPermission): void;
}
