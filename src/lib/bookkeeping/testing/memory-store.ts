import type { BankAccount, BankImport, BankLine } from "../bank";
import type { Expense, Supplier } from "../expenses";
import type { BankStore, ExpenseStore } from "../ports";

/**
 * Suppliers, expenses, bank accounts, imports and lines in memory, for
 * tests, with the Postgres stores' rules (./store-contract.ts checks both).
 */

const copy = <T>(value: T): T => structuredClone(value);
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function createMemoryExpenseStore(): ExpenseStore {
  const suppliers = new Map<string, Supplier>();
  const expenses = new Map<string, Expense>();
  const byName = (name: string) => [...suppliers.values()].find((supplier) => nameKey(supplier.name) === nameKey(name));

  return {
    async suppliers() {
      return [...suppliers.values()].sort((a, b) => a.name.localeCompare(b.name)).map(copy);
    },
    async supplier(id) {
      const supplier = suppliers.get(id);
      return supplier ? copy(supplier) : null;
    },
    async supplierByName(name) {
      const supplier = byName(name);
      return supplier ? copy(supplier) : null;
    },
    async addSupplier(supplier) {
      if (byName(supplier.name)) return "name-taken";
      suppliers.set(supplier.id, copy(supplier));
      return "added";
    },
    async changeSupplier(id, change) {
      const supplier = suppliers.get(id);
      if (!supplier) return "missing";
      const other = byName(change.name);
      if (other && other.id !== id) return "name-taken";
      suppliers.set(id, { ...supplier, name: change.name, notes: change.notes });
      return "changed";
    },

    async addExpense(expense) {
      if (!suppliers.has(expense.supplierId)) throw new Error("Unknown supplier");
      if (expenses.has(expense.id)) throw new Error("Duplicate expense");
      expenses.set(expense.id, copy(expense));
    },
    async expense(id) {
      const expense = expenses.get(id);
      return expense ? copy(expense) : null;
    },
    async expenses(filter) {
      return [...expenses.values()]
        .filter(
          (expense) =>
            (!filter.from || expense.date >= filter.from) &&
            (!filter.until || expense.date <= filter.until) &&
            (!filter.supplierId || expense.supplierId === filter.supplierId) &&
            (!filter.accountCode || expense.accountCode === filter.accountCode),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
        .slice(0, filter.limit)
        .map(copy);
    },
    async setJournal(id, journalId) {
      const expense = expenses.get(id);
      if (!expense || expense.journalId) return false;
      expenses.set(id, { ...expense, journalId });
      return true;
    },
    async voidExpense(id, at, by, reason) {
      const expense = expenses.get(id);
      if (!expense || expense.voidedAt) return false;
      expenses.set(id, { ...expense, voidedAt: at, voidedBy: by, voidReason: reason });
      return true;
    },
    async setVoidJournal(id, journalId) {
      const expense = expenses.get(id);
      if (!expense || !expense.voidedAt || expense.voidJournalId) return false;
      expenses.set(id, { ...expense, voidJournalId: journalId });
      return true;
    },
    async attachReceipt(id, fileId) {
      const expense = expenses.get(id);
      if (!expense || expense.voidedAt || expense.receiptFileId) return false;
      expenses.set(id, { ...expense, receiptFileId: fileId });
      return true;
    },
  };
}

export type MemoryBankOptions = {
  /** Whether a journal has been reversed, from the ledger the test uses. */
  journalReversed?: (journalId: string) => boolean;
};

/** The memory bank store, and the sealed numbers it keeps (for tests to check nothing is in the clear). */
export function createMemoryBankStore(options: MemoryBankOptions = {}): BankStore & { sealedNumbers: Map<string, string> } {
  const accounts = new Map<string, BankAccount>();
  const sealedNumbers = new Map<string, string>();
  const imports = new Map<string, BankImport>();
  const lines = new Map<string, Omit<BankLine, "matchReversed">>();
  const reversed = options.journalReversed ?? (() => false);

  const read = (line: Omit<BankLine, "matchReversed">): BankLine => copy({ ...line, matchReversed: line.match !== null && reversed(line.match.journalId) });
  const newestFirst = (a: BankLine, b: BankLine) => b.date.localeCompare(a.date) || b.rowNumber - a.rowNumber || b.id.localeCompare(a.id);
  const toReconcile = (line: BankLine) => line.match === null || line.matchReversed;

  return {
    sealedNumbers,
    async accounts() {
      return [...accounts.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).map(copy);
    },
    async account(id) {
      const account = accounts.get(id);
      return account ? copy(account) : null;
    },
    async addAccount(account, sealedNumber) {
      if ([...accounts.values()].some((other) => other.ledgerCode === account.ledgerCode)) return "ledger-taken";
      accounts.set(account.id, copy(account));
      sealedNumbers.set(account.id, sealedNumber);
      return "added";
    },
    async saveMapping(id, mapping) {
      const account = accounts.get(id);
      if (!account) return false;
      accounts.set(id, { ...account, mapping: copy(mapping) });
      return true;
    },

    async recordImport(entry, incoming) {
      if (!accounts.has(entry.bankAccountId)) throw new Error("Unknown bank account");
      const known = new Set([...lines.values()].filter((line) => line.bankAccountId === entry.bankAccountId).map((line) => line.dedupeHash));
      let added = 0;
      let duplicates = 0;
      const fresh: Omit<BankLine, "matchReversed">[] = [];
      for (const line of incoming) {
        if (known.has(line.dedupeHash)) {
          duplicates += 1;
          continue;
        }
        known.add(line.dedupeHash);
        const { matchReversed: _ignored, ...stored } = line;
        void _ignored;
        fresh.push({ ...stored, match: null, journalsMade: 0 });
        added += 1;
      }
      imports.set(entry.id, { ...entry, addedCount: added, duplicateCount: duplicates });
      for (const line of fresh) lines.set(line.id, copy(line));
      return { added, duplicates };
    },
    async imports(bankAccountId, limit) {
      return [...imports.values()]
        .filter((entry) => entry.bankAccountId === bankAccountId)
        .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime() || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(copy);
    },

    async lines(bankAccountId, filter) {
      return [...lines.values()]
        .filter((line) => line.bankAccountId === bankAccountId)
        .map(read)
        .filter((line) => filter.status === "all" || (filter.status === "unmatched" ? toReconcile(line) : !toReconcile(line)))
        .sort(newestFirst)
        .slice(0, filter.limit);
    },
    async line(id) {
      const line = lines.get(id);
      return line ? read(line) : null;
    },
    async lastBalancedLines(bankAccountId) {
      const balanced = [...lines.values()].filter((line) => line.bankAccountId === bankAccountId && line.balanceCents !== null);
      const last = balanced.reduce<string | null>((latest, line) => (latest === null || line.date > latest ? line.date : latest), null);
      return balanced
        .filter((line) => line.date === last)
        .map(read)
        .sort((a, b) => a.rowNumber - b.rowNumber);
    },
    async lineCounts(bankAccountId) {
      const own = [...lines.values()].filter((line) => line.bankAccountId === bankAccountId).map(read);
      return { lines: own.length, unmatched: own.filter(toReconcile).length };
    },
    async firstLineDate(bankAccountId) {
      return [...lines.values()].filter((line) => line.bankAccountId === bankAccountId).reduce<string | null>((first, line) => (first === null || line.date < first ? line.date : first), null);
    },
    async matchedJournals(bankAccountId, journalIds) {
      const wanted = new Set(journalIds);
      return new Map(
        [...lines.values()].filter((line) => line.bankAccountId === bankAccountId && line.match && wanted.has(line.match.journalId)).map((line) => [line.match!.journalId, line.id]),
      );
    },
    async setMatch(lineId, expectedJournalId, match, journalsMade) {
      const line = lines.get(lineId);
      if (!line || (line.match?.journalId ?? null) !== expectedJournalId) return "changed";
      if (match && [...lines.values()].some((other) => other.id !== lineId && other.bankAccountId === line.bankAccountId && other.match?.journalId === match.journalId)) return "journal-taken";
      lines.set(lineId, { ...line, match: match ? copy(match) : null, journalsMade: Math.max(line.journalsMade, journalsMade ?? 0) });
      return "set";
    },
  };
}
