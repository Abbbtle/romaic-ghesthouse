import type { IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { Payment } from "@/lib/money/money";
import type { BookingStatus } from "@/lib/reservations/reservations";
import type { LedgerAccount } from "./accounts";
import type { Journal, JournalSource, Period } from "./journals";

/** Totals of an account's lines over some dates. */
export type AccountSums = { accountCode: string; debitCents: number; creditCents: number };

export type PeriodState = {
  period: Period;
  status: "open" | "locked";
  lockedAt: Date | null;
  lockedBy: string | null;
  /** Why it was last reopened. */
  unlockReason: string | null;
};

export type LedgerSettings = {
  /** 1–12: the month the financial year ends (February by default, like SARS's year of assessment for individuals; open question #5). */
  yearEndMonth: number;
  /** The bank account card-machine and EFT receipts land in. */
  mainBank: string;
};

export const defaultLedgerSettings: LedgerSettings = { yearEndMonth: 2, mainBank: "1000" };

export type PostOutcome = { status: "posted" } | { status: "duplicate-source" } | { status: "period-locked" } | { status: "already-reversed" };

export type JournalFilter = { from?: IsoDate; until?: IsoDate; accountCode?: string; limit: number };

/**
 * The ledger's storage. Posting is one atomic write; the store refuses an
 * unbalanced journal, a journal in a locked month, a second journal for the
 * same source, and a second reversal (in Postgres: constraints and triggers,
 * so nothing can get round the service). Posted journals never change.
 */
export interface LedgerStore {
  accounts(): Promise<LedgerAccount[]>;
  addAccount(account: LedgerAccount): Promise<"added" | "exists">;
  setAccountActive(code: string, active: boolean): Promise<boolean>;

  post(journal: Journal): Promise<PostOutcome>;
  journal(id: string): Promise<Journal | null>;
  journalBySource(source: JournalSource): Promise<Journal | null>;
  /** How many journals a source has whose part starts with `partPrefix`. */
  countBySource(type: string, id: string, partPrefix: string): Promise<number>;
  /** Newest first. */
  journals(filter: JournalFilter): Promise<Journal[]>;
  /** The journal that reverses `id`, if there is one. */
  reversalOf(id: string): Promise<Journal | null>;
  /** Each account's totals over the dates (either end open). */
  sums(range: { from?: IsoDate; until?: IsoDate }): Promise<AccountSums[]>;
  /** One party's totals on one account: a booking's deposits held, say. */
  partySums(accountCode: string, party: string): Promise<{ debitCents: number; creditCents: number }>;
  /** Journals with a line on a cash account (10xx) in the dates, oldest first. */
  cashJournals(range: { from: IsoDate; until: IsoDate }): Promise<Journal[]>;

  periods(): Promise<PeriodState[]>;
  isLocked(period: Period): Promise<boolean>;
  lockPeriod(period: Period, at: Date, by: string): Promise<boolean>;
  unlockPeriod(period: Period, at: Date, by: string, reason: string): Promise<boolean>;

  settings(): Promise<LedgerSettings>;
  saveSettings(settings: LedgerSettings, at: Date, by: string): Promise<void>;
}

/** A booking as the ledger posts it. */
export type BookingForLedger = {
  id: string;
  ref: string;
  channel: string;
  status: BookingStatus;
  totalCents: number;
  /** The day it checked out, in the business's time zone; null before. */
  checkedOutOn: IsoDate | null;
  /** Extra lines on its latest invoice that isn't voided (laundry, meals): income on top of the stay. */
  extrasCents: number;
};

/** What the ledger reads of reservations and money, to post them. */
export interface MoneyFacts {
  booking(id: string): Promise<BookingForLedger | null>;
  payments(bookingId: string): Promise<Payment[]>;
  /** Bookings with a payment or a check-out on or after `since`, for the daily catch-up. */
  bookingsTouchedSince(since: Date): Promise<string[]>;
}

export type LedgerPermission = "ledger:view" | "ledger:post" | "periods:lock";

export type LedgerAccess = {
  can(actor: Actor, permission: LedgerPermission): boolean;
  assertCan(actor: Actor, permission: LedgerPermission): void;
};
