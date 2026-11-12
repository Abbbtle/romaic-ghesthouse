import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { addDays, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { systemAccounts, type LedgerAccount } from "@/lib/ledger/accounts";
import { periodOf, reversedLines, type Journal } from "@/lib/ledger/journals";
import { maskedNumber, type BankAccount } from "./bank";
import { expenseSchema, supplierSchema, voidExpenseSchema } from "./bookkeeping-input";
import { channelAccounts, expenseAccounts, expenseDraft, paymentSourceNames, type Expense, type PaymentSource, type Supplier } from "./expenses";
import type { BankStore, BookkeepingAccess, BooksLedger, ExpenseFilter, ExpenseStore } from "./ports";

export type ExpenseServiceDependencies = {
  expenses: ExpenseStore;
  bank: Pick<BankStore, "accounts" | "account">;
  ledger: BooksLedger;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: BookkeepingAccess;
};

/** What the expense form offers. */
export type ExpenseOptions = {
  today: IsoDate;
  accounts: { code: string; name: string; kind: LedgerAccount["kind"] }[];
  suppliers: Supplier[];
  /** Registered bank accounts; when there are none, "From a bank account" means the books' Bank (1000). */
  bankAccounts: { id: string; label: string; ledgerCode: string }[];
  channels: { code: string; name: string }[];
};

/** An expense as its page and the list show it. */
export type ExpenseView = Expense & {
  supplierName: string;
  accountName: string;
  /** "Business cheque ••1234", "Cash on hand", "Booking.com's payout", "The owner personally". */
  paidFromName: string;
  /** Whether its journal (and, once voided, its reversal) are in the books. */
  posted: boolean;
};

export type ExpenseDetail = { expense: ExpenseView; journal: Journal | null; voidJournal: Journal | null };

const expenseGone = "This expense no longer exists. Reload the page.";
const lockedMonth = "That month is locked in the books. Reopen it on the Months page first, or choose a day in an open month.";

/**
 * Expenses and suppliers (expenses:manage, the owner's). Recording an
 * expense posts its journal through the ledger; voiding keeps it, crossed
 * out, and reverses that journal. Posting is idempotent by source, so if it
 * fails after the expense is saved, "Post to the books" (or the next
 * change) tries again without doubling anything.
 */
export function createExpenseService(deps: ExpenseServiceDependencies) {
  const { expenses, bank, ledger, clock, ids, audit, access } = deps;

  async function record(actor: Actor, action: string, target: { type: string; id: string }, summary: string) {
    await audit.record({ actor, category: "money", action, target, summary });
  }

  async function chart(): Promise<Map<string, LedgerAccount>> {
    return new Map((await ledger.activeAccounts()).map((account) => [account.code, account]));
  }

  function paidFromName(expense: Pick<Expense, "paidBy" | "paidFrom" | "bankAccountId">, accounts: ReadonlyMap<string, LedgerAccount>, bankAccounts: readonly BankAccount[]): string {
    switch (expense.paidBy) {
      case "bank": {
        const account = bankAccounts.find((candidate) => candidate.id === expense.bankAccountId);
        return account ? `${account.name} ${maskedNumber(account.accountNumberLast4)}` : (accounts.get(expense.paidFrom)?.name ?? "Bank");
      }
      case "cash":
        return "Cash on hand";
      case "channel": {
        const channel = channelAccounts([...accounts.values()]).find((candidate) => candidate.code === expense.paidFrom);
        return channel ? `Taken off ${channel.name === "Another channel" ? "a channel" : channel.name}'s payout` : "Taken off a channel's payout";
      }
      case "owner":
        return "The owner personally";
    }
  }

  async function viewsOf(list: readonly Expense[]): Promise<ExpenseView[]> {
    // The whole chart: a switched-off account still names the expenses recorded against it.
    const [suppliers, accounts, bankAccounts] = await Promise.all([expenses.suppliers(), ledger.chartAccounts(), bank.accounts()]);
    const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const names = new Map(accounts.map((account) => [account.code, account]));
    return list.map((expense) => ({
      ...expense,
      supplierName: supplierNames.get(expense.supplierId) ?? "A supplier",
      accountName: names.get(expense.accountCode)?.name ?? `Account ${expense.accountCode}`,
      paidFromName: paidFromName(expense, names, bankAccounts),
      posted: expense.journalId !== null && (expense.voidedAt === null || expense.voidJournalId !== null),
    }));
  }

  /**
   * Brings an expense's journals up to date: its journal while it stands,
   * and the reversal once it's voided (when there was a journal to
   * reverse). Safe to run again: each posts once, by source.
   */
  async function sync(actor: Actor, expenseId: string): Promise<{ ok: true } | { ok: false; problem: string }> {
    let expense = await expenses.expense(expenseId);
    if (!expense) return { ok: false, problem: expenseGone };
    if (expense.journalId === null && expense.voidedAt === null) {
      const supplier = await expenses.supplier(expense.supplierId);
      const result = await ledger.postSystem(expenseDraft(expense, supplier?.name ?? "A supplier"), { by: actor });
      if (result.status === "refused") return { ok: false, problem: result.problem };
      await expenses.setJournal(expense.id, result.journal.id);
      expense = { ...expense, journalId: result.journal.id };
    }
    if (expense.voidedAt !== null && expense.voidJournalId === null) {
      const original = expense.journalId ? await ledger.journal(expense.journalId) : null;
      if (!original) return { ok: true };
      // Already reversed by hand on the Journals page: that reversal stands for the void.
      const reversedBy = await ledger.reversalOf(original.id);
      if (reversedBy) {
        await expenses.setVoidJournal(expense.id, reversedBy.id);
        return { ok: true };
      }
      // Reversed on the expense's own date while that month is open, so the month's figures come right; the ledger moves it to today when it's locked.
      const result = await ledger.postSystem(
        { date: original.date, memo: `Reverses "${original.memo}": ${expense.voidReason ?? "voided"}`, source: { type: "expense", id: expense.id, part: "void" }, reversalOf: original.id, lines: reversedLines(original.lines) },
        { by: actor },
      );
      if (result.status === "refused") return { ok: false, problem: result.problem };
      await expenses.setVoidJournal(expense.id, result.journal.id);
    }
    return { ok: true };
  }

  /** The supplier an expense names: an existing one by id, else one by that name, else a new one. */
  async function supplierFor(actor: Actor, supplierId: string | undefined, name: string | null): Promise<{ ok: true; supplier: Supplier } | { ok: false; errors: Record<string, string> }> {
    if (supplierId !== undefined && supplierId !== "new") {
      const supplier = await expenses.supplier(supplierId);
      return supplier ? { ok: true, supplier } : { ok: false, errors: { supplierId: "That supplier no longer exists. Choose another." } };
    }
    const existing = await expenses.supplierByName(name!);
    if (existing) return { ok: true, supplier: existing };
    const supplier: Supplier = { id: ids.newId(), name: name!, notes: null, createdAt: clock.now(), createdBy: actor.id };
    if ((await expenses.addSupplier(supplier)) === "name-taken") {
      const raced = await expenses.supplierByName(name!);
      if (raced) return { ok: true, supplier: raced };
    }
    await record(actor, "supplier.added", { type: "supplier", id: supplier.id }, `Added supplier ${supplier.name}`);
    return { ok: true, supplier };
  }

  return {
    async options(actor: Actor): Promise<ExpenseOptions> {
      access.assertCan(actor, "expenses:manage");
      const [accounts, suppliers, bankAccounts] = await Promise.all([ledger.activeAccounts(), expenses.suppliers(), bank.accounts()]);
      return {
        today: ledger.today(),
        accounts: expenseAccounts(accounts).map((account) => ({ code: account.code, name: account.name, kind: account.kind })),
        suppliers: suppliers.sort((a, b) => a.name.localeCompare(b.name)),
        bankAccounts: bankAccounts.map((account) => ({ id: account.id, label: `${account.name} ${maskedNumber(account.accountNumberLast4)}`, ledgerCode: account.ledgerCode })),
        channels: channelAccounts(accounts),
      };
    },

    /** Expenses in the dates (newest first), with what the ones that stand add up to. */
    async list(actor: Actor, filter: ExpenseFilter): Promise<{ expenses: ExpenseView[]; totalCents: number }> {
      access.assertCan(actor, "expenses:manage");
      const found = await expenses.expenses({ ...filter, limit: Math.min(Math.max(filter.limit, 1), 500) });
      return { expenses: await viewsOf(found), totalCents: found.filter((expense) => expense.voidedAt === null).reduce((sum, expense) => sum + expense.amountCents, 0) };
    },

    async expense(actor: Actor, id: string): Promise<ExpenseDetail | null> {
      access.assertCan(actor, "expenses:manage");
      const expense = await expenses.expense(id);
      if (!expense) return null;
      const [[view], journal, voidJournal] = await Promise.all([
        viewsOf([expense]),
        expense.journalId ? ledger.journal(expense.journalId) : Promise.resolve(null),
        expense.voidJournalId ? ledger.journal(expense.voidJournalId) : Promise.resolve(null),
      ]);
      return { expense: view!, journal, voidJournal };
    },

    /** Records an expense and posts its journal. Refused for a day in a locked month. */
    async record(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string; journalId: string | null; postProblem: string | null }>> {
      access.assertCan(actor, "expenses:manage");
      const parsed = parseWith(expenseSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      const today = ledger.today();
      if (draft.date > addDays(today, 31)) return refused({ date: "Choose a day no more than a month ahead." });
      if (await ledger.periodLocked(periodOf(draft.date))) return refused({ date: lockedMonth });
      const accounts = await chart();
      const spentOn = accounts.get(draft.accountCode);
      if (!spentOn || !expenseAccounts([spentOn]).length) return refused({ accountCode: "Choose what it was for from the list." });

      let paidFrom: string;
      let bankAccountId: string | null = null;
      switch (draft.paidBy) {
        case "bank": {
          const registered = await bank.accounts();
          if (draft.bankAccountId) {
            const account = registered.find((candidate) => candidate.id === draft.bankAccountId);
            if (!account) return refused({ bankAccountId: "That bank account isn't set up. Choose another." });
            paidFrom = account.ledgerCode;
            bankAccountId = account.id;
          } else if (registered.length === 0) {
            paidFrom = systemAccounts.bank;
          } else {
            return refused({ bankAccountId: "Choose the bank account it was paid from." });
          }
          break;
        }
        case "cash":
          paidFrom = systemAccounts.cashOnHand;
          break;
        case "channel":
          if (!channelAccounts([...accounts.values()]).some((channel) => channel.code === draft.channelAccount)) return refused({ channelAccount: "Choose the channel from the list." });
          paidFrom = draft.channelAccount!;
          break;
        case "owner":
          paidFrom = systemAccounts.ownersCapital;
          break;
      }
      if (!accounts.has(paidFrom)) return refused({ paidBy: "That account is switched off in the chart. Switch it on, or choose another way it was paid." });

      const supplier = await supplierFor(actor, draft.supplierId, draft.supplierName);
      if (!supplier.ok) return refused(supplier.errors);
      const expense: Expense = {
        id: ids.newId(),
        date: draft.date,
        supplierId: supplier.supplier.id,
        accountCode: draft.accountCode,
        amountCents: draft.amount,
        description: draft.description,
        paidBy: draft.paidBy,
        paidFrom,
        bankAccountId,
        receiptFileId: null,
        journalId: null,
        vatCents: null,
        recordedBy: actor.id,
        createdAt: clock.now(),
        voidedAt: null,
        voidReason: null,
        voidedBy: null,
        voidJournalId: null,
      };
      await expenses.addExpense(expense);
      await record(actor, "expense.recorded", { type: "expense", id: expense.id }, `Recorded ${formatCents(expense.amountCents)} to ${supplier.supplier.name} (${spentOn.name}) on ${expense.date}`);
      const posting = await sync(actor, expense.id);
      const stored = await expenses.expense(expense.id);
      return done({ id: expense.id, journalId: stored?.journalId ?? null, postProblem: posting.ok ? null : posting.problem });
    },

    /** Voids an expense entered by mistake: it stays on record, crossed out, with the reason, and its journal is reversed. */
    async voidExpense(actor: Actor, id: string, input: unknown): Promise<ChangeResult<{ postProblem: string | null }>> {
      access.assertCan(actor, "expenses:manage");
      const parsed = parseWith(voidExpenseSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const expense = await expenses.expense(id);
      if (!expense || expense.voidedAt) return refusedWith("This expense was already voided, or no longer exists. Reload the page.");
      if (!(await expenses.voidExpense(id, clock.now(), actor.id, parsed.value.reason))) return refusedWith("This expense was already voided. Reload the page.");
      await record(actor, "expense.voided", { type: "expense", id }, `Voided ${formatCents(expense.amountCents)} expense of ${expense.date}: ${parsed.value.reason}`);
      const posting = await sync(actor, id);
      return done({ postProblem: posting.ok ? null : posting.problem });
    },

    /** Tries again to post an expense's journal (or its reversal) that couldn't be posted at the time. */
    async retryPosting(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "expenses:manage");
      const posting = await sync(actor, id);
      return posting.ok ? done() : refusedWith(posting.problem);
    },

    /** Before a receipt is uploaded: whether the expense can take one, so a refused upload leaves no file behind. */
    async checkReceiptRoom(actor: Actor, id: string): Promise<ChangeResult> {
      access.assertCan(actor, "expenses:manage");
      const expense = await expenses.expense(id);
      if (!expense) return refusedWith(expenseGone);
      if (expense.voidedAt) return refusedWith("This expense is voided, so it can't take a receipt.");
      if (expense.receiptFileId) return refusedWith("This expense already has its receipt.");
      return done();
    },

    /** Keeps an uploaded receipt (a private file, purpose "receipt") with the expense. */
    async attachReceipt(actor: Actor, id: string, fileId: string): Promise<ChangeResult> {
      access.assertCan(actor, "expenses:manage");
      const expense = await expenses.expense(id);
      if (!expense) return refusedWith(expenseGone);
      if (!(await expenses.attachReceipt(id, fileId))) return refusedWith(expense.voidedAt ? "This expense is voided, so it can't take a receipt." : "This expense already has its receipt.");
      await record(actor, "expense.receipt-added", { type: "expense", id }, `Added the receipt for the ${formatCents(expense.amountCents)} expense of ${expense.date}`);
      return done();
    },

    // --- suppliers ---------------------------------------------------------------------

    async suppliers(actor: Actor): Promise<Supplier[]> {
      access.assertCan(actor, "expenses:manage");
      return (await expenses.suppliers()).sort((a, b) => a.name.localeCompare(b.name));
    },

    async addSupplier(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "expenses:manage");
      const parsed = parseWith(supplierSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const supplier: Supplier = { id: ids.newId(), name: parsed.value.name, notes: parsed.value.notes, createdAt: clock.now(), createdBy: actor.id };
      if ((await expenses.addSupplier(supplier)) === "name-taken") return refused({ name: "There's already a supplier with this name." });
      await record(actor, "supplier.added", { type: "supplier", id: supplier.id }, `Added supplier ${supplier.name}`);
      return done({ id: supplier.id });
    },

    async changeSupplier(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "expenses:manage");
      const parsed = parseWith(supplierSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const outcome = await expenses.changeSupplier(id, parsed.value);
      if (outcome === "missing") return refusedWith("This supplier no longer exists. Reload the page.");
      if (outcome === "name-taken") return refused({ name: "There's already a supplier with this name." });
      await record(actor, "supplier.changed", { type: "supplier", id }, `Changed supplier ${parsed.value.name}`);
      return done();
    },
  };
}

export type ExpenseService = ReturnType<typeof createExpenseService>;

/** How an expense was paid, in a few words, for lists. */
export function paidByName(source: PaymentSource): string {
  return paymentSourceNames[source];
}
