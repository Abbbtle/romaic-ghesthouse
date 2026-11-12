import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { Clock } from "@/lib/kernel/ports";
import { reversedLines, totalsOf, type Journal } from "@/lib/ledger/journals";
import { createLedgerService } from "@/lib/ledger/ledger-service";
import { createMemoryLedgerStore, memoryLedgerState } from "@/lib/ledger/testing/memory-store";
import type { LedgerAccess, LedgerPermission } from "@/lib/ledger/ports";
import { createBankService } from "../bank-service";
import { booksLedgerOf } from "../books-ledger";
import { createExpenseService } from "../expense-service";
import type { BookkeepingAccess, BookkeepingPermission } from "../ports";
import { createMemoryBankStore, createMemoryExpenseStore } from "./memory-store";
import type { BookkeepingFixtures } from "./store-contract";

/** What the test access check throws, standing in for the accounts core's NotAllowedError. */
export class TestNotAllowedError extends Error {
  constructor(readonly permission: string) {
    super(`Not allowed: ${permission}`);
    this.name = "TestNotAllowedError";
  }
}

/** Bookkeeping permissions per role, as roles.md grants them: the owner's alone. src/server checks the real matrix too. */
const grants: Record<Role, readonly BookkeepingPermission[]> = { owner: ["expenses:manage", "bank:manage"], admin: [], sales: [], staff: [] };

export const testBookkeepingAccess: BookkeepingAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

const ledgerGrants: Record<Role, readonly LedgerPermission[]> = { owner: ["ledger:view", "ledger:post", "periods:lock"], admin: [], sales: [], staff: [] };
const ledgerAccess: LedgerAccess = {
  can: (actor, permission) => ledgerGrants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!ledgerGrants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

export function testActor(role: Role): Actor {
  return { id: `00000000-0000-4000-8000-0000000000${role === "owner" ? "a1" : role === "admin" ? "a2" : role === "sales" ? "a3" : "a4"}`, role, name: `Test ${role}` };
}

/** A sealer that marks what it sealed and where, so tests can see a number was never stored in the clear. */
export const testSealer = { seal: (secret: string, context: string) => `sealed(${context}):${[...secret].reverse().join("")}` };

/**
 * Expenses and bank services on memory stores and a real ledger service
 * (also in memory), at 10:00 SAST on Thursday 12 November 2026.
 */
export function bookkeepingHarness(options: { now?: string; access?: BookkeepingAccess } = {}) {
  let instant = new Date(options.now ?? "2026-11-12T08:00:00Z");
  const clock: Clock = { now: () => new Date(instant) };
  const ledgerState = memoryLedgerState();
  const ledgerStore = createMemoryLedgerStore(ledgerState);
  let next = 0;
  const ids = { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` };
  const audit = memoryAuditRecorder();
  const ledgerService = createLedgerService({
    store: ledgerStore,
    facts: { booking: async () => null, payments: async () => [], bookingsTouchedSince: async () => [] },
    clock,
    ids,
    audit,
    access: ledgerAccess,
    reportProblem: () => {},
    timeZone: "Africa/Johannesburg",
  });
  const ledger = booksLedgerOf(ledgerService, ledgerStore);
  const expenseStore = createMemoryExpenseStore();
  const bankStore = createMemoryBankStore({ journalReversed: (journalId) => ledgerState.journals.some((journal) => journal.reversalOf === journalId) });
  const access = options.access ?? testBookkeepingAccess;
  const shared = { ledger, clock, ids, audit, access };
  const expenses = createExpenseService({ ...shared, expenses: expenseStore, bank: bankStore });
  const bank = createBankService({ ...shared, bank: bankStore, vault: testSealer, sha256: (text) => `h:${text}` });

  /** An account's balance in the books (debits less credits). */
  const balance = async (code: string, until?: string) => {
    const sum = (await ledgerStore.sums({ until })).find((entry) => entry.accountCode === code) ?? { debitCents: 0, creditCents: 0 };
    return sum.debitCents - sum.creditCents;
  };

  /** Posts a journal straight into the books, as the money pages would (a guest's EFT): `cents` into `bankCode` from `otherCode`. */
  const post = async (date: string, cents: number, memo = "Deposit for RG-B2C3D by EFT", bankCode = "1000", otherCode = "2000"): Promise<Journal> => {
    const journal: Journal = {
      id: ids.newId(),
      date,
      period: date.slice(0, 7),
      memo,
      source: null,
      reversalOf: null,
      postedBy: null,
      postedAt: clock.now(),
      lines:
        cents > 0
          ? [
              { accountCode: bankCode, debitCents: cents, creditCents: 0, party: null, memo: null },
              { accountCode: otherCode, debitCents: 0, creditCents: cents, party: null, memo: null },
            ]
          : [
              { accountCode: otherCode, debitCents: -cents, creditCents: 0, party: null, memo: null },
              { accountCode: bankCode, debitCents: 0, creditCents: -cents, party: null, memo: null },
            ],
    };
    await ledgerStore.post(journal);
    return journal;
  };

  /** Reverses a journal straight in the books, as the Journals page would. */
  const reverse = async (journal: Journal) => {
    const reversal: Journal = { ...journal, id: ids.newId(), memo: `Reverses "${journal.memo}"`, source: null, reversalOf: journal.id, lines: reversedLines(journal.lines) };
    await ledgerStore.post(reversal);
    return reversal;
  };

  const fixtures: BookkeepingFixtures = {
    postJournal: async (cents, bankCode = "1000") => (await post("2026-11-05", cents, "Test", bankCode, "3000")).id,
    reverseJournal: async (journalId) => {
      const journal = await ledgerStore.journal(journalId);
      if (journal) await reverse(journal);
    },
    storeFile: async () => ids.newId(),
    addBankLedgerAccount: async (code) => {
      await ledgerStore.addAccount({ code, name: "Savings", kind: "asset", system: true, active: true });
      return code;
    },
  };

  return {
    clock,
    setNow: (now: string) => {
      instant = new Date(now);
    },
    ledgerState,
    ledgerStore,
    ledgerService,
    ledger,
    expenseStore,
    bankStore,
    audit,
    expenses,
    bank,
    balance,
    post,
    reverse,
    fixtures,
    /** Whether every journal in the books balances. */
    balanced: () => ledgerState.journals.every((journal) => totalsOf(journal.lines).debitCents === totalsOf(journal.lines).creditCents),
  };
}
