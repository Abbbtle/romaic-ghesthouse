import type { Journal, JournalLine } from "../journals";
import type { LedgerStore } from "../ports";

/**
 * What every LedgerStore must do, as cases run against a fresh store holding
 * the default chart:
 *
 *   for (const { name, run } of ledgerStoreContract) it(name, async () => run(await freshStore()));
 */
export type LedgerStoreCase = { name: string; run: (store: LedgerStore) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
let counter = 0;
const nextId = () => `00000000-0000-4000-8000-00000001${String((counter += 1)).padStart(4, "0")}`;

export const testLine = (accountCode: string, side: "debit" | "credit", cents: number, party: string | null = null): JournalLine => ({
  accountCode,
  debitCents: side === "debit" ? cents : 0,
  creditCents: side === "credit" ? cents : 0,
  party,
  memo: null,
});

export function testJournal(fields: Partial<Journal> = {}): Journal {
  const date = fields.date ?? "2026-11-12";
  return {
    id: nextId(),
    date,
    period: date.slice(0, 7),
    memo: "Owner's capital paid in",
    source: null,
    reversalOf: null,
    postedBy: ownerId,
    postedAt: new Date(`${date}T10:00:00.000Z`),
    lines: [testLine("1000", "debit", 500_000), testLine("3000", "credit", 500_000)],
    ...fields,
  };
}

export const ledgerStoreContract: readonly LedgerStoreCase[] = [
  {
    name: "starts with the chart, adds an account once, and switches accounts on and off",
    async run(store) {
      const codes = (await store.accounts()).map((account) => account.code);
      expectSame(codes.includes("1000") && codes.includes("4000") && codes.includes("6200"), true, "default chart");
      expectSame((await store.accounts()).find((account) => account.code === "2100")?.active, false, "VAT output starts off");
      expectSame(await store.addAccount({ code: "5250", name: "Guest amenities", kind: "expense", system: false, active: true }), "added", "add");
      expectSame(await store.addAccount({ code: "5250", name: "Again", kind: "expense", system: false, active: true }), "exists", "again");
      expectSame(await store.setAccountActive("5250", false), true, "off");
      expectSame((await store.accounts()).find((account) => account.code === "5250")?.active, false, "is off");
      expectSame(await store.setAccountActive("9999", true), false, "unknown");
    },
  },
  {
    name: "posts a balanced journal and reads it back, and refuses an unbalanced one",
    async run(store) {
      const journal = testJournal({ lines: [testLine("1000", "debit", 500_000), testLine("3000", "credit", 500_000, "owner")] });
      expectSame(await store.post(journal), { status: "posted" }, "post");
      expectSame(await store.journal(journal.id), journal, "read back");
      let refused = false;
      try {
        await store.post(testJournal({ lines: [testLine("1000", "debit", 500_000), testLine("3000", "credit", 400_000)] }));
      } catch {
        refused = true;
      }
      expectSame(refused, true, "unbalanced refused");
      expectSame((await store.journals({ limit: 10 })).length, 1, "only the balanced one");
    },
  },
  {
    name: "keeps one journal per source and one reversal per journal",
    async run(store) {
      const source = { type: "payment", id: "p1", part: "received" };
      const first = testJournal({ source });
      expectSame(await store.post(first), { status: "posted" }, "first");
      expectSame(await store.post(testJournal({ source })), { status: "duplicate-source" }, "same source");
      expectSame((await store.journalBySource(source))?.id, first.id, "found by source");
      const reversal = testJournal({ reversalOf: first.id, lines: [testLine("3000", "debit", 500_000), testLine("1000", "credit", 500_000)] });
      expectSame(await store.post(reversal), { status: "posted" }, "reversal");
      expectSame(await store.post(testJournal({ reversalOf: first.id, lines: reversal.lines })), { status: "already-reversed" }, "twice");
      expectSame((await store.reversalOf(first.id))?.id, reversal.id, "reversed by");
      await store.post(testJournal({ source: { type: "booking", id: "b1", part: "transfer:1" } }));
      await store.post(testJournal({ source: { type: "booking", id: "b1", part: "transfer:2" } }));
      expectSame(await store.countBySource("booking", "b1", "transfer:"), 2, "transfers counted");
    },
  },
  {
    name: "refuses journals in a locked month until it's reopened",
    async run(store) {
      expectSame(await store.lockPeriod("2026-10", new Date("2026-11-12T10:00:00Z"), ownerId), true, "lock");
      expectSame(await store.lockPeriod("2026-10", new Date("2026-11-12T10:00:00Z"), ownerId), false, "already locked");
      expectSame(await store.isLocked("2026-10"), true, "is locked");
      expectSame(await store.post(testJournal({ date: "2026-10-31" })), { status: "period-locked" }, "refused");
      expectSame(await store.unlockPeriod("2026-10", new Date("2026-11-12T11:00:00Z"), ownerId, "Accountant's correction"), true, "unlock");
      expectSame(await store.post(testJournal({ date: "2026-10-31" })), { status: "posted" }, "posted once open");
      const october = (await store.periods()).find((state) => state.period === "2026-10");
      expectSame([october?.status, october?.unlockReason], ["open", "Accountant's correction"], "kept the reason");
    },
  },
  {
    name: "totals accounts over dates, by party, and lists cash journals oldest first",
    async run(store) {
      await store.post(testJournal({ date: "2026-11-01", lines: [testLine("1000", "debit", 100_000), testLine("2000", "credit", 100_000, "booking:b1")] }));
      await store.post(testJournal({ date: "2026-11-05", lines: [testLine("1010", "debit", 20_000), testLine("2000", "credit", 20_000, "booking:b2")] }));
      await store.post(testJournal({ date: "2026-11-09", lines: [testLine("5200", "debit", 30_000), testLine("1000", "credit", 30_000)] }));
      await store.post(testJournal({ date: "2026-11-10", lines: [testLine("1200", "debit", 50_000, "booking:b1"), testLine("4000", "credit", 50_000)] }));
      const sums = await store.sums({ from: "2026-11-02", until: "2026-11-09" });
      const byCode = Object.fromEntries(sums.map((sum) => [sum.accountCode, [sum.debitCents, sum.creditCents]]));
      expectSame(byCode, { "1010": [20_000, 0], "2000": [0, 20_000], "5200": [30_000, 0], "1000": [0, 30_000] }, "sums in range");
      expectSame(await store.partySums("2000", "booking:b1"), { debitCents: 0, creditCents: 100_000 }, "party");
      expectSame((await store.cashJournals({ from: "2026-11-01", until: "2026-11-30" })).map((journal) => journal.date), ["2026-11-01", "2026-11-05", "2026-11-09"], "cash journals");
      expectSame((await store.journals({ accountCode: "4000", limit: 10 })).map((journal) => journal.date), ["2026-11-10"], "by account");
      expectSame((await store.journals({ limit: 2 })).map((journal) => journal.date), ["2026-11-10", "2026-11-09"], "newest first");
    },
  },
  {
    name: "keeps the books' settings",
    async run(store) {
      expectSame(await store.settings(), { yearEndMonth: 2, mainBank: "1000" }, "defaults");
      await store.saveSettings({ yearEndMonth: 6, mainBank: "1010" }, new Date("2026-11-12T10:00:00Z"), ownerId);
      expectSame(await store.settings(), { yearEndMonth: 6, mainBank: "1010" }, "saved");
    },
  },
];

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (item instanceof Date ? item.toISOString() : item));
}

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
