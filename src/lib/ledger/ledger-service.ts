import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { addDays, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { counts } from "@/lib/money/money";
import { kindOfCode, systemAccounts, type LedgerAccount } from "./accounts";
import { bookingParty, draftProblem, journalAmount, periodOf, reversedLines, type DraftProblem, type Journal, type JournalDraft, type Period } from "./journals";
import { linesFromForm, manualJournalSchema, newAccountSchema, reverseSchema, settingsSchema, unlockSchema } from "./ledger-input";
import type { JournalFilter, LedgerAccess, LedgerSettings, LedgerStore, MoneyFacts, PeriodState } from "./ports";
import { checkOutDraft, depositTransferDraft, paymentDraft } from "./posting-rules";
import { balanceSheet, cashFlow, financialYearEnd, financialYearStart, profitAndLoss, trialBalance, type BalanceSheet, type CashFlow, type ProfitAndLoss, type TrialBalance } from "./reports";

export type LedgerServiceDependencies = {
  store: LedgerStore;
  facts: MoneyFacts;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: LedgerAccess;
  /** Logs a problem nobody can be shown, such as a booking that couldn't be posted in the daily catch-up. */
  reportProblem: (message: string) => void;
  timeZone: string;
};

/** How the system posts: who (null for itself) and whether a locked month may move the journal to today. */
export type SystemPosting = { by: Actor | null };

export type SystemPostResult = { status: "posted"; journal: Journal } | { status: "exists"; journal: Journal } | { status: "refused"; problem: string };

const problemText = (problem: DraftProblem): string => {
  switch (problem.kind) {
    case "too-few-lines":
      return "A journal needs at least two lines.";
    case "too-many-lines":
      return "A journal can have at most 40 lines.";
    case "bad-amount":
      return `Line ${problem.line + 1}: enter an amount as a debit or a credit.`;
    case "unknown-account":
      return `Line ${problem.line + 1}: that account isn't in the chart.`;
    case "inactive-account":
      return `Line ${problem.line + 1}: that account is switched off.`;
    case "unbalanced":
      return `Debits (${formatCents(problem.debitCents)}) and credits (${formatCents(problem.creditCents)}) must be equal.`;
  }
};

const lockedMessage = "That month is locked. Reopen it first, or date the journal in an open month.";

const automaticMessages: Record<string, string> = {
  payment: "This journal came from a payment. Void the payment on its booking's money page instead, and the books follow.",
  booking: "This journal came from a booking's check-out. Correct the booking or post a correcting journal instead.",
  expense: "This journal came from an expense. Void the expense instead, and the books follow.",
  "bank-line": "This journal came from a bank statement line. Unmatch the line instead.",
  "payroll-run": "This journal came from a payroll run. Correct the run instead.",
  other: "This journal was posted automatically. Correct it where it came from, or post a correcting journal.",
};

/**
 * The ledger: the chart, posting and reversing journals, months locked
 * after filing, and the statements. Booking money is posted by `sync`
 * (idempotent: each payment, void and check-out posts once), from the money
 * pages, check-out and the daily catch-up. Owner only (ledger:view,
 * ledger:post, periods:lock).
 */
export function createLedgerService(deps: LedgerServiceDependencies) {
  const { store, facts, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor | null, action: string, target: { type: string; id: string }, summary: string, category: "money" | "periods" = "money") {
    await audit.record({ actor, category, action, target, summary });
  }

  async function chartMap(): Promise<Map<string, LedgerAccount>> {
    return new Map((await store.accounts()).map((account) => [account.code, account]));
  }

  function journalFrom(draft: JournalDraft, date: IsoDate, by: Actor | null, memo = draft.memo): Journal {
    return { id: ids.newId(), date, period: periodOf(date), memo, source: draft.source, reversalOf: draft.reversalOf ?? null, postedBy: by?.id ?? null, postedAt: clock.now(), lines: draft.lines };
  }

  /**
   * Posts a journal on the system's behalf (bookings' money now; expenses,
   * bank lines and payroll from their own cores). Posting a source again
   * answers with the journal already there. A journal dated in a locked
   * month moves to today, saying so in its memo, so a late correction never
   * reopens a filed month.
   */
  async function postSystem(draft: JournalDraft, posting: SystemPosting): Promise<SystemPostResult> {
    if (draft.source) {
      const existing = await store.journalBySource(draft.source);
      if (existing) return { status: "exists", journal: existing };
    }
    const problem = draftProblem(draft, await chartMap());
    if (problem) return { status: "refused", problem: problemText(problem) };
    let date = draft.date;
    let memo = draft.memo;
    if (await store.isLocked(periodOf(date))) {
      date = today();
      memo = `${draft.memo} (for ${draft.date}, in a locked month)`;
      if (await store.isLocked(periodOf(date))) return { status: "refused", problem: lockedMessage };
    }
    const journal = journalFrom(draft, date, posting.by, memo);
    const outcome = await store.post(journal);
    if (outcome.status === "duplicate-source" && draft.source) {
      const existing = await store.journalBySource(draft.source);
      if (existing) return { status: "exists", journal: existing };
    }
    if (outcome.status !== "posted") return { status: "refused", problem: outcome.status === "period-locked" ? lockedMessage : "That journal was already reversed." };
    return { status: "posted", journal };
  }

  /** Reverses `original` on `date` (moved to today if that month is locked), with the reason in its memo. */
  async function reverse(original: Journal, date: IsoDate, reason: string, posting: SystemPosting, source: JournalDraft["source"]): Promise<SystemPostResult> {
    return postSystem({ date, memo: `Reverses "${original.memo}": ${reason}`, source, reversalOf: original.id, lines: reversedLines(original.lines) }, posting);
  }

  /** Posts whatever a booking's money still needs: payments, voids, its check-out, and moving its deposits across. Safe to run again and again. */
  async function sync(bookingId: string): Promise<{ posted: number; problems: string[] }> {
    const booking = await facts.booking(bookingId);
    if (!booking) return { posted: 0, problems: [] };
    const [payments, settings] = await Promise.all([facts.payments(bookingId), store.settings()]);
    let posted = 0;
    const problems: string[] = [];
    const note = (result: SystemPostResult) => {
      if (result.status === "posted") posted += 1;
      else if (result.status === "refused") problems.push(`${booking.ref}: ${result.problem}`);
    };
    for (const payment of payments) {
      const draft = paymentDraft(payment, booking, settings);
      if (!draft) continue;
      if (counts(payment)) {
        note(await postSystem(draft, { by: null }));
        continue;
      }
      // Voided: undo its journal, if it was ever posted.
      const original = await store.journalBySource(draft.source!);
      if (!original) continue;
      const voidedOn = payment.voidedAt ? zonedToday(payment.voidedAt, deps.timeZone) : today();
      note(await reverse(original, voidedOn, payment.voidReason ?? "voided", { by: null }, { type: "payment", id: payment.id, part: "void" }));
    }
    const checkOut = checkOutDraft(booking);
    if (checkOut) {
      note(await postSystem(checkOut, { by: null }));
      const held = await store.partySums(systemAccounts.guestDeposits, bookingParty(booking.id));
      const heldCents = held.creditCents - held.debitCents;
      if (heldCents !== 0) {
        const sequence = (await store.countBySource("booking", booking.id, "transfer:")) + 1;
        // The first move is on the check-out day; a later one (after a correction) on the day it's found.
        const on = sequence === 1 ? booking.checkedOutOn! : today();
        const transfer = depositTransferDraft(booking, heldCents, on, sequence);
        if (transfer) note(await postSystem(transfer, { by: null }));
      }
    }
    return { posted, problems };
  }

  async function sumsUntil(date: IsoDate) {
    return store.sums({ until: date });
  }

  return {
    today,
    postSystem,
    sync,

    /** For other cores (expenses, bank, payroll) before they post: whether a month is locked. No permission: they check their own. */
    periodLocked: (period: Period) => store.isLocked(period),

    /** For other cores' account choices: the chart's switched-on accounts. No permission: they check their own. */
    activeAccounts: async () => (await store.accounts()).filter((account) => account.active).sort((a, b) => a.code.localeCompare(b.code)),

    /** For other cores that keep a ledger account per thing of theirs (bank accounts): adds one. No permission: they check their own. */
    addSystemAccount: (account: LedgerAccount) => store.addAccount(account),

    /** For reports in other cores (tax): each account's totals over the dates. No permission: they check their own. */
    sumsFor: (range: { from?: IsoDate; until?: IsoDate }) => store.sums(range),

    /** For other cores' export packs: every journal in the dates, oldest first, uncapped. No permission: they check their own. */
    journalsFor: async (range: { from: IsoDate; until: IsoDate }) =>
      (await store.journals({ ...range, limit: 1_000_000 })).sort((a, b) => a.date.localeCompare(b.date) || a.postedAt.getTime() - b.postedAt.getTime()),

    /** The daily job: posts any booking whose money or check-out changed in the last `days` days (in case a page's own posting failed). */
    async catchUp(days = 7): Promise<{ bookings: number; posted: number; problems: number }> {
      const since = new Date(clock.now().getTime() - days * 86_400_000);
      const touched = await facts.bookingsTouchedSince(since);
      let posted = 0;
      let problems = 0;
      for (const id of touched) {
        try {
          const result = await sync(id);
          posted += result.posted;
          problems += result.problems.length;
          for (const problem of result.problems) deps.reportProblem(`Ledger catch-up: ${problem}`);
        } catch (error) {
          problems += 1;
          deps.reportProblem(`Ledger catch-up failed for a booking (${error instanceof Error ? error.name : typeof error}).`);
        }
      }
      return { bookings: touched.length, posted, problems };
    },

    // --- the chart -------------------------------------------------------------------

    async chart(actor: Actor): Promise<LedgerAccount[]> {
      access.assertCan(actor, "ledger:view");
      return (await store.accounts()).sort((a, b) => a.code.localeCompare(b.code));
    },

    async addAccount(actor: Actor, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "ledger:post");
      const parsed = parseWith(newAccountSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const kind = kindOfCode(parsed.value.code)!;
      if ((await store.addAccount({ code: parsed.value.code, name: parsed.value.name, kind, system: false, active: true })) === "exists") {
        return refused({ code: "Another account already has this code." });
      }
      await record(actor, "ledger.account-added", { type: "ledger-account", id: parsed.value.code }, `Added account ${parsed.value.code} ${parsed.value.name}`);
      return done();
    },

    async setAccountActive(actor: Actor, code: string, active: boolean): Promise<ChangeResult> {
      access.assertCan(actor, "ledger:post");
      const account = (await store.accounts()).find((candidate) => candidate.code === code);
      if (!account) return refusedWith("That account isn't in the chart. Reload the page.");
      if (account.system && !active) return refusedWith("Automatic postings use this account, so it stays on.");
      if (!(await store.setAccountActive(code, active))) return refusedWith("That account isn't in the chart. Reload the page.");
      await record(actor, active ? "ledger.account-on" : "ledger.account-off", { type: "ledger-account", id: code }, `${active ? "Switched on" : "Switched off"} account ${code} ${account.name}`);
      return done();
    },

    // --- journals --------------------------------------------------------------------

    async journals(actor: Actor, filter: JournalFilter): Promise<Journal[]> {
      access.assertCan(actor, "ledger:view");
      return store.journals({ ...filter, limit: Math.min(Math.max(filter.limit, 1), 200) });
    },

    async journal(actor: Actor, id: string): Promise<{ journal: Journal; reversedBy: Journal | null; reverses: Journal | null } | null> {
      access.assertCan(actor, "ledger:view");
      const journal = await store.journal(id);
      if (!journal) return null;
      const [reversedBy, reverses] = await Promise.all([store.reversalOf(id), journal.reversalOf ? store.journal(journal.reversalOf) : Promise.resolve(null)]);
      return { journal, reversedBy, reverses };
    },

    /** A manual journal from the form: depreciation, the owner putting money in, a correction. */
    async postManual(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "ledger:post");
      const fields = (input ?? {}) as Record<string, unknown>;
      const head = parseWith(manualJournalSchema, fields);
      const lines = linesFromForm(fields);
      if (!head.ok || !lines.ok) return refused({ ...(head.ok ? {} : head.errors), ...(lines.ok ? {} : lines.errors) });
      if (head.value.date > addDays(today(), 31)) return refused({ date: "Date it no more than a month ahead." });
      const source = head.value.idempotencyKey ? { type: "manual", id: head.value.idempotencyKey, part: "posted" } : null;
      if (source) {
        const already = await store.journalBySource(source);
        if (already) return done({ id: already.id });
      }
      const draft: JournalDraft = { date: head.value.date, memo: head.value.memo, source, lines: lines.lines };
      const problem = draftProblem(draft, await chartMap());
      if (problem) return refused("line" in problem ? { [`line.${problem.line}.account`]: problemText(problem) } : { form: problemText(problem) });
      if (await store.isLocked(periodOf(draft.date))) return refused({ date: lockedMessage });
      const journal = journalFrom(draft, draft.date, actor);
      const outcome = await store.post(journal);
      if (outcome.status === "period-locked") return refused({ date: lockedMessage });
      if (outcome.status === "duplicate-source" && source) {
        const already = await store.journalBySource(source);
        if (already) return done({ id: already.id });
      }
      if (outcome.status !== "posted") return refusedWith("That journal couldn't be posted. Reload the page and try again.");
      await record(actor, "ledger.journal-posted", { type: "journal", id: journal.id }, `Posted "${journal.memo}" for ${formatCents(journalAmount(journal))} on ${journal.date}`);
      return done({ id: journal.id });
    },

    /** Undoes a journal with its reversal, dated today. Each journal can be reversed once; a reversal can't be reversed (post the journal again instead). */
    async reverseJournal(actor: Actor, id: string, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "ledger:post");
      const parsed = parseWith(reverseSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const original = await store.journal(id);
      if (!original) return refusedWith("This journal no longer exists. Reload the page.");
      if (original.reversalOf) return refusedWith("This journal is itself a reversal. Post the original again instead.");
      // An automatic journal is undone where it came from (voiding the payment or expense), or the books and the record would disagree.
      if (original.source && original.source.type !== "manual") return refusedWith(automaticMessages[original.source.type] ?? automaticMessages.other!);
      if (await store.reversalOf(id)) return refusedWith("This journal was already reversed.");
      const result = await reverse(original, today(), parsed.value.reason, { by: actor }, original.source ? { type: original.source.type, id: original.source.id, part: `${original.source.part}:reversed` } : null);
      if (result.status !== "posted") return refusedWith(result.status === "refused" ? result.problem : "This journal was already reversed.");
      await record(actor, "ledger.journal-reversed", { type: "journal", id: original.id }, `Reversed "${original.memo}": ${parsed.value.reason}`);
      return done({ id: result.journal.id });
    },

    // --- months -----------------------------------------------------------------------

    async periods(actor: Actor): Promise<PeriodState[]> {
      access.assertCan(actor, "ledger:view");
      return store.periods();
    },

    /** Locks a month (after its returns are filed): nothing more can be posted in it. */
    async lockPeriod(actor: Actor, period: Period): Promise<ChangeResult> {
      access.assertCan(actor, "periods:lock");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return refusedWith("Reload the page and try again.");
      if (`${period}-01` > today()) return refusedWith("A month can be locked once it has started.");
      if (!(await store.lockPeriod(period, clock.now(), actor.id))) return refusedWith("That month is already locked.");
      await record(actor, "period.locked", { type: "period", id: period }, `Locked ${period}`, "periods");
      return done();
    },

    /** Reopens a locked month, with the reason on record. */
    async unlockPeriod(actor: Actor, period: Period, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "periods:lock");
      const parsed = parseWith(unlockSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      if (!(await store.unlockPeriod(period, clock.now(), actor.id, parsed.value.reason))) return refusedWith("That month isn't locked.");
      await record(actor, "period.unlocked", { type: "period", id: period }, `Reopened ${period}: ${parsed.value.reason}`, "periods");
      return done();
    },

    async settings(actor: Actor): Promise<LedgerSettings> {
      access.assertCan(actor, "ledger:view");
      return store.settings();
    },

    async saveSettings(actor: Actor, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "ledger:post");
      const parsed = parseWith(settingsSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const bank = (await store.accounts()).find((account) => account.code === parsed.value.mainBank);
      if (!bank || !bank.active || bank.kind !== "asset") return refused({ mainBank: "Choose a bank account that's switched on." });
      await store.saveSettings({ yearEndMonth: parsed.value.yearEndMonth, mainBank: parsed.value.mainBank }, clock.now(), actor.id);
      await record(actor, "ledger.settings-saved", { type: "ledger-settings", id: "books" }, `Financial year ends in month ${parsed.value.yearEndMonth}; main bank ${parsed.value.mainBank}`);
      return done();
    },

    // --- statements -------------------------------------------------------------------

    async trialBalance(actor: Actor, until: IsoDate): Promise<TrialBalance> {
      access.assertCan(actor, "ledger:view");
      const [accounts, sums] = await Promise.all([store.accounts(), sumsUntil(until)]);
      return trialBalance(accounts, sums);
    },

    async profitAndLoss(actor: Actor, range: { from: IsoDate; until: IsoDate }): Promise<ProfitAndLoss> {
      access.assertCan(actor, "ledger:view");
      const [accounts, sums] = await Promise.all([store.accounts(), store.sums(range)]);
      return profitAndLoss(accounts, sums);
    },

    async balanceSheet(actor: Actor, at: IsoDate): Promise<BalanceSheet & { yearStart: IsoDate }> {
      access.assertCan(actor, "ledger:view");
      const settings = await store.settings();
      const yearStart = financialYearStart(at, settings.yearEndMonth);
      const [accounts, untilDate, beforeYear] = await Promise.all([store.accounts(), sumsUntil(at), sumsUntil(addDays(yearStart, -1))]);
      return { ...balanceSheet(accounts, untilDate, beforeYear), yearStart };
    },

    async cashFlow(actor: Actor, range: { from: IsoDate; until: IsoDate }): Promise<CashFlow> {
      access.assertCan(actor, "ledger:view");
      const [before, journals] = await Promise.all([sumsUntil(addDays(range.from, -1)), store.cashJournals(range)]);
      const opening = before.filter((sum) => /^10\d\d$/.test(sum.accountCode)).reduce((total, sum) => total + sum.debitCents - sum.creditCents, 0);
      return cashFlow(journals, opening);
    },

    /** The financial year a date falls in, from the books' settings. */
    async financialYear(actor: Actor, date: IsoDate): Promise<{ start: IsoDate; end: IsoDate }> {
      access.assertCan(actor, "ledger:view");
      const start = financialYearStart(date, (await store.settings()).yearEndMonth);
      return { start, end: financialYearEnd(start) };
    },
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;
