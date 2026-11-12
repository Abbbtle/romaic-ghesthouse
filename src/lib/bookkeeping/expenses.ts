import type { IsoDate } from "@/lib/format/zoned-time";
import { channelReceivables, systemAccounts, type LedgerAccount } from "@/lib/ledger/accounts";
import type { JournalDraft, JournalLine } from "@/lib/ledger/journals";

/**
 * Expenses: what the guesthouse spends, each against a supplier and an
 * account in the chart, and how it was paid. Recording one posts its
 * journal; nothing is ever deleted: a mistake is voided, with a reason,
 * stays on record crossed out, and its journal is reversed. Amounts are
 * integer cents.
 *
 * The business is treated as not VAT-registered until the owner says
 * otherwise (open question #1): expenses carry no VAT.
 */

export type Supplier = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
};

export const paymentSources = ["bank", "cash", "channel", "owner"] as const;
export type PaymentSource = (typeof paymentSources)[number];

export const paymentSourceNames: Record<PaymentSource, string> = {
  bank: "From a bank account",
  cash: "Cash on hand",
  channel: "Taken off a channel's payout",
  owner: "Paid by the owner personally",
};

export type Expense = {
  id: string;
  date: IsoDate;
  supplierId: string;
  /** The account it's spent against: an expense account, or an asset such as equipment. */
  accountCode: string;
  amountCents: number;
  description: string;
  paidBy: PaymentSource;
  /** The account the money came out of: a bank account (10xx), cash on hand, a channel's receivable, or owner's capital. */
  paidFrom: string;
  /** The bank account it was paid from, when it was. */
  bankAccountId: string | null;
  /** A receipt kept as a private file. */
  receiptFileId: string | null;
  /** Its journal, once posted. */
  journalId: string | null;
  /** Always null while the business isn't VAT-registered. */
  vatCents: null;
  recordedBy: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedBy: string | null;
  /** The journal reversing it, once voided and posted. */
  voidJournalId: string | null;
};

export const expenseLimits = {
  descriptionMax: 200,
  supplierNameMax: 80,
  supplierNotesMax: 500,
  reasonMax: 200,
  /** R1,000,000: more than any single expense here, so a slip of extra zeros is caught. */
  maxCents: 100_000_000,
} as const;

/** "supplier:<id>": the party on an expense's line, so spending can be added up per supplier. */
export function supplierParty(supplierId: string): string {
  return `supplier:${supplierId}`;
}

/**
 * The accounts an expense can be spent against: switched-on expense
 * accounts (not depreciation, which is a journal of its own), and assets
 * bought outright such as equipment (15xx, not accumulated depreciation).
 */
export function expenseAccounts(accounts: readonly LedgerAccount[]): LedgerAccount[] {
  return accounts.filter(
    (account) =>
      account.active &&
      ((account.kind === "expense" && account.code !== systemAccounts.depreciation) ||
        (account.kind === "asset" && account.code.startsWith("15") && account.code !== systemAccounts.accumulatedDepreciation)),
  );
}

/** The channels' receivables an expense can be taken off (commission), with their names: "Booking.com". */
export function channelAccounts(accounts: readonly LedgerAccount[]): { code: string; name: string }[] {
  const codes = new Set<string>([...Object.values(channelReceivables), systemAccounts.otaReceivables]);
  return accounts
    .filter((account) => account.active && codes.has(account.code))
    .sort((a, b) => (a.code === systemAccounts.otaReceivables ? 1 : b.code === systemAccounts.otaReceivables ? -1 : a.code.localeCompare(b.code)))
    .map((account) => ({ code: account.code, name: account.code === systemAccounts.otaReceivables ? "Another channel" : account.name.replace(/ receivable$/i, "") }));
}

/** Whether `code` is a bank account's ledger account (10xx, but not cash on hand or the gateway's clearing account). */
export function isBankLedgerCode(code: string): boolean {
  return /^10\d\d$/.test(code) && code !== systemAccounts.cashOnHand && code !== systemAccounts.gatewayClearing;
}

const line = (accountCode: string, side: "debit" | "credit", cents: number, party: string | null, memo: string | null = null): JournalLine => ({
  accountCode,
  debitCents: side === "debit" ? cents : 0,
  creditCents: side === "credit" ? cents : 0,
  party,
  memo,
});

/**
 * An expense's journal: the account it's spent against is debited, the
 * account the money came out of is credited (the bank, cash on hand, the
 * channel that took it off its payout, or owner's capital when the owner
 * paid personally).
 */
export function expenseDraft(expense: Expense, supplierName: string): JournalDraft {
  return {
    date: expense.date,
    memo: clip(`${supplierName}: ${expense.description}`, 300),
    source: { type: "expense", id: expense.id, part: "recorded" },
    lines: [line(expense.accountCode, "debit", expense.amountCents, supplierParty(expense.supplierId)), line(expense.paidFrom, "credit", expense.amountCents, null)],
  };
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
