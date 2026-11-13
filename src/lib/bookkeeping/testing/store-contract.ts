import type { BankAccount, BankLine } from "../bank";
import type { Expense, Supplier } from "../expenses";
import type { BankStore, ExpenseStore } from "../ports";
import type { StatementMapping } from "../statement";

/**
 * What every ExpenseStore and BankStore must do, as cases run against fresh
 * stores whose database holds the default chart. The fixtures stand in for
 * what the database must already hold (Postgres checks the foreign keys;
 * memory doesn't care):
 *
 *   for (const { name, run } of expenseStoreContract) it(name, async () => run(store, fixtures));
 */
export type BookkeepingFixtures = {
  /** Posts a balanced journal moving `cents` into (or, negative, out of) `bankCode`, and answers with its id. */
  postJournal(cents: number, bankCode?: string): Promise<string>;
  /** Reverses a posted journal. */
  reverseJournal(journalId: string): Promise<void>;
  /** Stores a private file (a receipt), and answers with its id. */
  storeFile(): Promise<string>;
  /** Adds a bank's account to the chart (as a second bank account gets), and answers with its code. */
  addBankLedgerAccount(code: string): Promise<string>;
};

export type ExpenseStoreCase = { name: string; run: (store: ExpenseStore, fixtures: BookkeepingFixtures) => Promise<void> };
export type BankStoreCase = { name: string; run: (store: BankStore, fixtures: BookkeepingFixtures) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-0000000b${String((counter += 1)).padStart(4, "0")}`;

export function testSupplier(fields: Partial<Supplier> = {}): Supplier {
  return { id: nextId(), name: "Welkom Hardware", notes: null, createdAt: at, createdBy: ownerId, ...fields };
}

export function testExpense(supplierId: string, fields: Partial<Expense> = {}): Expense {
  return {
    id: nextId(),
    date: "2026-11-10",
    supplierId,
    accountCode: "5500",
    amountCents: 45_000,
    description: "Tap washers and a new shower head",
    paidBy: "cash",
    paidFrom: "1010",
    bankAccountId: null,
    receiptFileId: null,
    journalId: null,
    vatCents: null,
    recordedBy: ownerId,
    createdAt: at,
    voidedAt: null,
    voidReason: null,
    voidedBy: null,
    voidJournalId: null,
    ...fields,
  };
}

export const testMapping: StatementMapping = {
  separator: ",",
  skipRows: 0,
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "yyyy-mm-dd",
  descriptionColumn: 1,
  referenceColumn: null,
  amount: { kind: "single", column: 2 },
  balanceColumn: 3,
  decimal: ".",
};

export function testBankAccount(fields: Partial<BankAccount> = {}): BankAccount {
  return { id: nextId(), name: "Business cheque", bankName: "The bank", accountNumberLast4: "6789", ledgerCode: "1000", mapping: null, createdAt: at, createdBy: ownerId, ...fields };
}

export function testLine(bankAccountId: string, importId: string, fields: Partial<BankLine> = {}): BankLine {
  return {
    id: nextId(),
    bankAccountId,
    importId,
    date: "2026-11-05",
    description: "EFT from T Mokoena RG-B2C3D",
    amountCents: 60_000,
    balanceCents: 160_000,
    dedupeHash: `hash-${counter}`,
    rowNumber: 2,
    match: null,
    matchReversed: false,
    journalsMade: 0,
    ...fields,
  };
}

const importOf = (bankAccountId: string, id = nextId()) => ({ id, bankAccountId, fileName: "november.csv", importedAt: at, importedBy: ownerId, rowCount: 0, skippedCount: 0 });

export const expenseStoreContract: readonly ExpenseStoreCase[] = [
  {
    name: "adds suppliers once per name, ignoring capitals and spaces, and changes them",
    async run(store) {
      const supplier = testSupplier();
      expectSame(await store.addSupplier(supplier), "added", "add");
      expectSame(await store.addSupplier(testSupplier({ name: "  welkom   HARDWARE " })), "name-taken", "same name");
      expectSame((await store.supplierByName("WELKOM hardware"))?.id, supplier.id, "found by name");
      expectSame(await store.supplier(supplier.id), supplier, "read back");
      const other = testSupplier({ name: "Free State Linen" });
      await store.addSupplier(other);
      expectSame(await store.changeSupplier(other.id, { name: "Welkom Hardware", notes: null }), "name-taken", "rename onto another");
      expectSame(await store.changeSupplier(other.id, { name: "Free State Linen Co", notes: "Delivers on Tuesdays" }), "changed", "change");
      expectSame(await store.changeSupplier(nextId(), { name: "Nobody", notes: null }), "missing", "missing");
      expectSame((await store.suppliers()).map((entry) => [entry.name, entry.notes]), [["Free State Linen Co", "Delivers on Tuesdays"], ["Welkom Hardware", null]], "listed by name");
    },
  },
  {
    name: "records expenses and lists them newest first, by dates, supplier and account",
    async run(store) {
      const hardware = testSupplier();
      const linen = testSupplier({ name: "Free State Linen" });
      await store.addSupplier(hardware);
      await store.addSupplier(linen);
      const first = testExpense(hardware.id, { date: "2026-10-30" });
      const second = testExpense(linen.id, { date: "2026-11-02", accountCode: "5200", amountCents: 120_050, paidBy: "owner", paidFrom: "3000" });
      const third = testExpense(hardware.id, { date: "2026-11-02", createdAt: later, paidBy: "channel", paidFrom: "1110", accountCode: "5000", description: "Commission" });
      for (const expense of [first, second, third]) await store.addExpense(expense);
      expectSame(await store.expense(second.id), second, "read back");
      expectSame((await store.expenses({ limit: 10 })).map((expense) => expense.id), [third.id, second.id, first.id], "newest first");
      expectSame((await store.expenses({ from: "2026-11-01", until: "2026-11-30", limit: 10 })).map((expense) => expense.id), [third.id, second.id], "dates");
      expectSame((await store.expenses({ supplierId: hardware.id, limit: 10 })).map((expense) => expense.id), [third.id, first.id], "supplier");
      expectSame((await store.expenses({ accountCode: "5200", limit: 10 })).map((expense) => expense.id), [second.id], "account");
      expectSame((await store.expenses({ limit: 1 })).length, 1, "limit");
    },
  },
  {
    name: "notes an expense's journal once, voids it once with its reversal, and keeps it",
    async run(store, fixtures) {
      const supplier = testSupplier();
      await store.addSupplier(supplier);
      const expense = testExpense(supplier.id);
      await store.addExpense(expense);
      const journalId = await fixtures.postJournal(-45_000, "1010");
      expectSame(await store.setVoidJournal(expense.id, journalId), false, "void journal before voiding");
      expectSame(await store.setJournal(expense.id, journalId), true, "journal");
      expectSame(await store.setJournal(expense.id, journalId), false, "journal again");
      expectSame(await store.voidExpense(expense.id, later, ownerId, "Entered twice"), true, "void");
      expectSame(await store.voidExpense(expense.id, later, ownerId, "again"), false, "void again");
      const reversalId = await fixtures.postJournal(45_000, "1010");
      expectSame(await store.setVoidJournal(expense.id, reversalId), true, "void journal");
      expectSame(await store.setVoidJournal(expense.id, reversalId), false, "void journal again");
      const voided = await store.expense(expense.id);
      expectSame(
        [voided?.journalId, voided?.voidedAt, voided?.voidReason, voided?.voidedBy, voided?.voidJournalId, voided?.amountCents],
        [journalId, later, "Entered twice", ownerId, reversalId, 45_000],
        "kept, voided",
      );
    },
  },
  {
    name: "keeps one receipt per expense, and none on a voided one",
    async run(store, fixtures) {
      const supplier = testSupplier();
      await store.addSupplier(supplier);
      const expense = testExpense(supplier.id);
      const voided = testExpense(supplier.id);
      await store.addExpense(expense);
      await store.addExpense(voided);
      const fileId = await fixtures.storeFile();
      expectSame(await store.attachReceipt(expense.id, fileId), true, "attach");
      expectSame(await store.attachReceipt(expense.id, await fixtures.storeFile()), false, "a second");
      expectSame((await store.expense(expense.id))?.receiptFileId, fileId, "kept");
      await store.voidExpense(voided.id, later, ownerId, "Wrong supplier");
      expectSame(await store.attachReceipt(voided.id, await fixtures.storeFile()), false, "voided");
    },
  },
];

export const bankStoreContract: readonly BankStoreCase[] = [
  {
    name: "adds bank accounts, one per ledger account, and saves how their statements are read",
    async run(store) {
      const account = testBankAccount();
      expectSame(await store.addAccount(account, "sealed-number"), "added", "add");
      expectSame(await store.addAccount(testBankAccount({ name: "Another" }), "sealed-other"), "ledger-taken", "same ledger account");
      expectSame(await store.account(account.id), account, "read back");
      expectSame(await store.saveMapping(account.id, testMapping), true, "mapping");
      expectSame((await store.account(account.id))?.mapping, testMapping, "mapping kept");
      expectSame(await store.saveMapping(nextId(), testMapping), false, "no such account");
      expectSame((await store.accounts()).map((entry) => entry.id), [account.id], "listed");
    },
  },
  {
    name: "imports lines once: an overlapping statement adds only the new ones",
    async run(store) {
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const first = importOf(account.id);
      const a = testLine(account.id, first.id, { dedupeHash: "a", date: "2026-11-03", rowNumber: 2 });
      const b = testLine(account.id, first.id, { dedupeHash: "b", date: "2026-11-04", rowNumber: 3, amountCents: -12_500, balanceCents: 147_500 });
      expectSame(await store.recordImport({ ...first, rowCount: 2 }, [a, b]), { added: 2, duplicates: 0 }, "first import");
      const second = importOf(account.id);
      const c = testLine(account.id, second.id, { dedupeHash: "c", date: "2026-11-06", rowNumber: 3 });
      expectSame(await store.recordImport({ ...second, rowCount: 2 }, [testLine(account.id, second.id, { dedupeHash: "b" }), c]), { added: 1, duplicates: 1 }, "overlap");
      // Both at the same moment here, so newest is the later id.
      expectSame((await store.imports(account.id, 5)).map((entry) => [entry.id, entry.addedCount, entry.duplicateCount, entry.rowCount]), [[second.id, 1, 1, 2], [first.id, 2, 0, 2]], "imports kept");
      expectSame((await store.lines(account.id, { status: "all", limit: 10 })).map((line) => line.id), [c.id, b.id, a.id], "newest first");
      expectSame(await store.line(b.id), b, "read back");
      expectSame(await store.lineCounts(account.id), { lines: 3, unmatched: 3 }, "counts");
    },
  },
  {
    name: "finds the last day's lines with a balance",
    async run(store) {
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const entry = importOf(account.id);
      const lines = [
        testLine(account.id, entry.id, { dedupeHash: "1", date: "2026-11-03", balanceCents: 100_000, rowNumber: 2 }),
        testLine(account.id, entry.id, { dedupeHash: "2", date: "2026-11-05", balanceCents: 160_000, rowNumber: 3 }),
        testLine(account.id, entry.id, { dedupeHash: "3", date: "2026-11-05", amountCents: -5_000, balanceCents: 155_000, rowNumber: 4 }),
        testLine(account.id, entry.id, { dedupeHash: "4", date: "2026-11-06", balanceCents: null, rowNumber: 5 }),
      ];
      await store.recordImport({ ...entry, rowCount: 4 }, lines);
      expectSame((await store.lastBalancedLines(account.id)).map((line) => line.dedupeHash), ["2", "3"], "last balanced day");
    },
  },
  {
    name: "finds the day an account's statements begin",
    async run(store) {
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      expectSame(await store.firstLineDate(account.id), null, "nothing imported");
      const first = importOf(account.id);
      await store.recordImport({ ...first, rowCount: 2 }, [
        testLine(account.id, first.id, { dedupeHash: "a", date: "2026-11-05", rowNumber: 2 }),
        testLine(account.id, first.id, { dedupeHash: "b", date: "2026-11-09", rowNumber: 3 }),
      ]);
      const earlier = importOf(account.id);
      await store.recordImport({ ...earlier, rowCount: 1 }, [testLine(account.id, earlier.id, { dedupeHash: "c", date: "2026-10-28", rowNumber: 2 })]);
      expectSame(await store.firstLineDate(account.id), "2026-10-28", "an earlier statement imported later");
      expectSame(await store.firstLineDate(testBankAccount().id), null, "another account");
    },
  },
  {
    name: "matches a line to a journal once, refusing a stale match or a journal already used, and unmatches",
    async run(store, fixtures) {
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const entry = importOf(account.id);
      const line = testLine(account.id, entry.id, { dedupeHash: "x" });
      const other = testLine(account.id, entry.id, { dedupeHash: "y", rowNumber: 3 });
      await store.recordImport({ ...entry, rowCount: 2 }, [line, other]);
      const journalId = await fixtures.postJournal(60_000);
      const match = { journalId, kind: "existing" as const, at: later, by: ownerId };
      expectSame(await store.setMatch(line.id, journalId, match), "changed", "expected a match that isn't there");
      expectSame(await store.setMatch(line.id, null, match), "set", "match");
      expectSame(await store.setMatch(other.id, null, match), "journal-taken", "journal used");
      expectSame((await store.line(line.id))?.match, match, "kept");
      expectSame(await store.matchedJournals(account.id, [journalId, "00000000-0000-4000-8000-00000000ffff"]), new Map([[journalId, line.id]]), "matched journals");
      expectSame(await store.lineCounts(account.id), { lines: 2, unmatched: 1 }, "one to reconcile");
      expectSame((await store.lines(account.id, { status: "matched", limit: 10 })).map((entry) => entry.id), [line.id], "matched");
      expectSame((await store.lines(account.id, { status: "unmatched", limit: 10 })).map((entry) => entry.id), [other.id], "unmatched");
      expectSame(await store.setMatch(line.id, journalId, null), "set", "unmatch");
      expectSame((await store.line(line.id))?.match, null, "unmatched");
      const made = await fixtures.postJournal(60_000);
      expectSame(await store.setMatch(line.id, null, { ...match, journalId: made, kind: "created" }, 2), "set", "made");
      expectSame((await store.line(line.id))?.journalsMade, 2, "count raised");
      expectSame(await store.setMatch(line.id, made, null, 1), "set", "unmatched again");
      expectSame((await store.line(line.id))?.journalsMade, 2, "count never lowered");
    },
  },
  {
    name: "matches one journal to a line on each of two accounts (a transfer), but only once per account",
    async run(store, fixtures) {
      const cheque = testBankAccount();
      const savings = testBankAccount({ name: "Savings", ledgerCode: await fixtures.addBankLedgerAccount("1001") });
      await store.addAccount(cheque, "sealed");
      await store.addAccount(savings, "sealed-savings");
      const chequeImport = importOf(cheque.id);
      const savingsImport = importOf(savings.id);
      const out = testLine(cheque.id, chequeImport.id, { dedupeHash: "out", amountCents: -50_000 });
      const again = testLine(cheque.id, chequeImport.id, { dedupeHash: "again", amountCents: -50_000, rowNumber: 3 });
      const into = testLine(savings.id, savingsImport.id, { dedupeHash: "in", amountCents: 50_000 });
      await store.recordImport({ ...chequeImport, rowCount: 2 }, [out, again]);
      await store.recordImport({ ...savingsImport, rowCount: 1 }, [into]);
      const journalId = await fixtures.postJournal(-50_000);
      const match = { journalId, kind: "created" as const, at: later, by: ownerId };
      expectSame(await store.setMatch(out.id, null, match), "set", "out of the cheque account");
      expectSame(await store.setMatch(into.id, null, { ...match, kind: "existing" }), "set", "into savings: the same journal");
      expectSame(await store.setMatch(again.id, null, match), "journal-taken", "the cheque account again");
      expectSame(await store.matchedJournals(cheque.id, [journalId]), new Map([[journalId, out.id]]), "the cheque account's view");
      expectSame(await store.matchedJournals(savings.id, [journalId]), new Map([[journalId, into.id]]), "savings' view");
    },
  },
  {
    name: "puts a line whose journal was reversed back to reconcile",
    async run(store, fixtures) {
      const account = testBankAccount();
      await store.addAccount(account, "sealed");
      const entry = importOf(account.id);
      const line = testLine(account.id, entry.id, { dedupeHash: "z" });
      await store.recordImport({ ...entry, rowCount: 1 }, [line]);
      const journalId = await fixtures.postJournal(60_000);
      await store.setMatch(line.id, null, { journalId, kind: "existing", at: later, by: ownerId });
      expectSame((await store.line(line.id))?.matchReversed, false, "standing");
      await fixtures.reverseJournal(journalId);
      expectSame((await store.line(line.id))?.matchReversed, true, "reversed");
      expectSame(await store.lineCounts(account.id), { lines: 1, unmatched: 1 }, "to reconcile again");
      expectSame((await store.lines(account.id, { status: "unmatched", limit: 10 })).map((entry) => entry.id), [line.id], "listed to reconcile");
    },
  },
];

/** JSON with object keys in order (Maps as their entries), so two stores may build records in different orders. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner instanceof Map) return { map: [...inner.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))) };
    return inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner;
  });
}

export function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
