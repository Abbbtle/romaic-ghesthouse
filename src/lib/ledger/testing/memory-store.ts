import { defaultChart, isCashAccount, type LedgerAccount } from "../accounts";
import { totalsOf, type Journal, type JournalSource } from "../journals";
import { defaultLedgerSettings, type AccountSums, type LedgerSettings, type LedgerStore, type PeriodState } from "../ports";

/**
 * The ledger in memory, for tests, keeping the Postgres store's rules
 * (./store-contract.ts checks both): balanced journals only, none in a
 * locked month, one per source, one reversal each, nothing changed once
 * posted.
 */
export type MemoryLedgerState = {
  accounts: Map<string, LedgerAccount>;
  journals: Journal[];
  periods: Map<string, PeriodState>;
  settings: LedgerSettings;
};

export function memoryLedgerState(): MemoryLedgerState {
  return { accounts: new Map(defaultChart.map((account) => [account.code, { ...account }])), journals: [], periods: new Map(), settings: { ...defaultLedgerSettings } };
}

const copy = <T>(value: T): T => structuredClone(value);
const sameSource = (a: JournalSource | null, b: JournalSource) => a !== null && a.type === b.type && a.id === b.id && a.part === b.part;

export function createMemoryLedgerStore(state: MemoryLedgerState = memoryLedgerState()): LedgerStore {
  const inRange = (journal: Journal, range: { from?: string; until?: string }) => (!range.from || journal.date >= range.from) && (!range.until || journal.date <= range.until);
  const newestFirst = (a: Journal, b: Journal) => b.date.localeCompare(a.date) || b.postedAt.getTime() - a.postedAt.getTime();

  return {
    async accounts() {
      return [...state.accounts.values()].map(copy);
    },
    async addAccount(account) {
      if (state.accounts.has(account.code)) return "exists";
      state.accounts.set(account.code, copy(account));
      return "added";
    },
    async setAccountActive(code, active) {
      const account = state.accounts.get(code);
      if (!account) return false;
      state.accounts.set(code, { ...account, active });
      return true;
    },

    async post(journal) {
      const totals = totalsOf(journal.lines);
      if (journal.lines.length < 2 || totals.debitCents !== totals.creditCents) throw new Error("Unbalanced journal");
      if (journal.lines.some((line) => !state.accounts.has(line.accountCode))) throw new Error("Unknown account");
      if (state.periods.get(journal.period)?.status === "locked") return { status: "period-locked" };
      if (journal.source && state.journals.some((other) => sameSource(other.source, journal.source!))) return { status: "duplicate-source" };
      if (journal.reversalOf && state.journals.some((other) => other.reversalOf === journal.reversalOf)) return { status: "already-reversed" };
      state.journals.push(copy(journal));
      return { status: "posted" };
    },
    async journal(id) {
      const journal = state.journals.find((candidate) => candidate.id === id);
      return journal ? copy(journal) : null;
    },
    async journalBySource(source) {
      const journal = state.journals.find((candidate) => sameSource(candidate.source, source));
      return journal ? copy(journal) : null;
    },
    async countBySource(type, id, partPrefix) {
      return state.journals.filter((journal) => journal.source?.type === type && journal.source.id === id && journal.source.part.startsWith(partPrefix)).length;
    },
    async journals(filter) {
      return state.journals
        .filter((journal) => inRange(journal, filter) && (!filter.accountCode || journal.lines.some((line) => line.accountCode === filter.accountCode)))
        .sort(newestFirst)
        .slice(0, filter.limit)
        .map(copy);
    },
    async reversalOf(id) {
      const journal = state.journals.find((candidate) => candidate.reversalOf === id);
      return journal ? copy(journal) : null;
    },
    async sums(range) {
      const totals = new Map<string, AccountSums>();
      for (const journal of state.journals.filter((candidate) => inRange(candidate, range))) {
        for (const line of journal.lines) {
          const sum = totals.get(line.accountCode) ?? { accountCode: line.accountCode, debitCents: 0, creditCents: 0 };
          sum.debitCents += line.debitCents;
          sum.creditCents += line.creditCents;
          totals.set(line.accountCode, sum);
        }
      }
      return [...totals.values()];
    },
    async partySums(accountCode, party) {
      const lines = state.journals.flatMap((journal) => journal.lines).filter((line) => line.accountCode === accountCode && line.party === party);
      return totalsOf(lines);
    },
    async cashJournals(range) {
      return state.journals
        .filter((journal) => inRange(journal, range) && journal.lines.some((line) => isCashAccount(line.accountCode)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.postedAt.getTime() - b.postedAt.getTime())
        .map(copy);
    },

    async periods() {
      return [...state.periods.values()].sort((a, b) => b.period.localeCompare(a.period)).map(copy);
    },
    async isLocked(period) {
      return state.periods.get(period)?.status === "locked";
    },
    async lockPeriod(period, at, by) {
      if (state.periods.get(period)?.status === "locked") return false;
      state.periods.set(period, { period, status: "locked", lockedAt: at, lockedBy: by, unlockReason: state.periods.get(period)?.unlockReason ?? null });
      return true;
    },
    async unlockPeriod(period, _at, _by, reason) {
      const current = state.periods.get(period);
      if (current?.status !== "locked") return false;
      state.periods.set(period, { ...current, status: "open", unlockReason: reason });
      return true;
    },

    async settings() {
      return copy(state.settings);
    },
    async saveSettings(settings) {
      state.settings = copy(settings);
    },
  };
}
