import "server-only";
import { accountKinds, type AccountKind, type LedgerAccount } from "@/lib/ledger/accounts";
import type { Journal, JournalLine } from "@/lib/ledger/journals";
import { defaultLedgerSettings, type AccountSums, type LedgerStore, type PeriodState, type PostOutcome } from "@/lib/ledger/ports";
import type { Database, SqlExecutor } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type AccountRow = { code: string; name: string; kind: string; system: boolean; active: boolean };

type JournalRow = {
  id: string;
  entry_date: string;
  period: string;
  memo: string;
  source_type: string | null;
  source_id: string | null;
  source_part: string | null;
  reversal_of: string | null;
  posted_by: string | null;
  posted_at: Date;
};

type LineRow = { journal_id: string; line_no: number; account_code: string; debit_cents: number | string; credit_cents: number | string; party: string | null; memo: string | null };

const journalColumns = "j.id, j.entry_date, j.period, j.memo, j.source_type, j.source_id, j.source_part, j.reversal_of, j.posted_by, j.posted_at";

const kindOf = (value: string): AccountKind => ((accountKinds as readonly string[]).includes(value) ? (value as AccountKind) : "asset");

/** A sum Postgres may answer as a string (numeric, bigint) or a number. */
const cents = (value: number | string | null | undefined): number => Number(value ?? 0);

/** SQLSTATE the locked-period trigger raises (migration 310). */
const lockedPeriodState = "RGLCK";

const isLockedPeriod = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === lockedPeriodState;

function accountOf(row: AccountRow): LedgerAccount {
  return { code: row.code, name: row.name, kind: kindOf(row.kind), system: row.system, active: row.active };
}

function lineOf(row: LineRow): JournalLine {
  return { accountCode: row.account_code, debitCents: cents(row.debit_cents), creditCents: cents(row.credit_cents), party: row.party, memo: row.memo };
}

/** Journals with their lines, in the order the rows came. */
async function withLines(db: SqlExecutor, rows: JournalRow[]): Promise<Journal[]> {
  if (rows.length === 0) return [];
  const lines = await db.all<LineRow>(
    "select journal_id, line_no, account_code, debit_cents, credit_cents, party, memo from app.journal_lines where journal_id = any(:ids::uuid[]) order by journal_id, line_no",
    { ids: `{${rows.map((row) => row.id).join(",")}}` },
  );
  const byJournal = new Map<string, JournalLine[]>();
  for (const line of lines) byJournal.set(line.journal_id, [...(byJournal.get(line.journal_id) ?? []), lineOf(line)]);
  return rows.map((row) => ({
    id: row.id,
    date: row.entry_date,
    period: row.period,
    memo: row.memo,
    source: row.source_type && row.source_id && row.source_part ? { type: row.source_type, id: row.source_id, part: row.source_part } : null,
    reversalOf: row.reversal_of,
    postedBy: row.posted_by,
    postedAt: row.posted_at,
    lines: byJournal.get(row.id) ?? [],
  }));
}

/** The ledger in Postgres (migrations 300 and 310): the database itself refuses unbalanced journals, locked months, repeats and edits. */
export function createPostgresLedgerStore(db: Database): LedgerStore {
  const rangeWhere = (range: { from?: string; until?: string }) =>
    [range.from ? "j.entry_date >= :from::date" : null, range.until ? "j.entry_date <= :until::date" : null].filter(Boolean).join(" and ") || "true";

  return {
    async accounts() {
      const rows = await db.all<AccountRow>("select code, name, kind, system, active from app.ledger_accounts order by code");
      return rows.map(accountOf);
    },

    async addAccount(account) {
      try {
        await db.run("insert into app.ledger_accounts (code, name, kind, system, active) values (:code, :name, :kind, :system, :active)", { ...account });
        return "added";
      } catch (error) {
        if (error instanceof UniqueViolationError) return "exists";
        throw error;
      }
    },

    async setAccountActive(code, active) {
      const { changes } = await db.run("update app.ledger_accounts set active = :active where code = :code", { code, active });
      return changes === 1;
    },

    async post(journal): Promise<PostOutcome> {
      if (!isUuid(journal.id)) throw new Error("A journal's id must be a UUID.");
      try {
        await db.transaction(async (tx) => {
          await tx.run(
            `insert into app.journals (id, entry_date, period, memo, source_type, source_id, source_part, reversal_of, posted_by, posted_at)
             values (:id, :date::date, :period, :memo, :sourceType, :sourceId, :sourcePart, :reversalOf, :postedBy, :postedAt)`,
            {
              id: journal.id,
              date: journal.date,
              period: journal.period,
              memo: journal.memo,
              sourceType: journal.source?.type ?? null,
              sourceId: journal.source?.id ?? null,
              sourcePart: journal.source?.part ?? null,
              reversalOf: journal.reversalOf,
              postedBy: journal.postedBy,
              postedAt: journal.postedAt,
            },
          );
          for (const [index, line] of journal.lines.entries()) {
            await tx.run(
              `insert into app.journal_lines (journal_id, line_no, account_code, debit_cents, credit_cents, party, memo)
               values (:journalId, :lineNo, :accountCode, :debit, :credit, :party, :memo)`,
              { journalId: journal.id, lineNo: index, accountCode: line.accountCode, debit: line.debitCents, credit: line.creditCents, party: line.party, memo: line.memo },
            );
          }
        });
        return { status: "posted" };
      } catch (error) {
        if (isLockedPeriod(error)) return { status: "period-locked" };
        if (error instanceof UniqueViolationError && error.constraint === "journals_source_unique") return { status: "duplicate-source" };
        if (error instanceof UniqueViolationError && error.constraint === "journals_one_reversal") return { status: "already-reversed" };
        throw error;
      }
    },

    async journal(id) {
      if (!isUuid(id)) return null;
      const rows = await db.all<JournalRow>(`select ${journalColumns} from app.journals j where j.id = :id`, { id });
      return (await withLines(db, rows))[0] ?? null;
    },

    async journalBySource(source) {
      const rows = await db.all<JournalRow>(`select ${journalColumns} from app.journals j where j.source_type = :type and j.source_id = :id and j.source_part = :part`, source);
      return (await withLines(db, rows))[0] ?? null;
    },

    async countBySource(type, id, partPrefix) {
      const row = await db.get<{ count: number | string }>(
        "select count(*) as count from app.journals where source_type = :type and source_id = :id and starts_with(source_part, :prefix)",
        { type, id, prefix: partPrefix },
      );
      return cents(row?.count);
    },

    async journals(filter) {
      const account = filter.accountCode ? "and exists (select 1 from app.journal_lines l where l.journal_id = j.id and l.account_code = :account)" : "";
      const rows = await db.all<JournalRow>(
        `select ${journalColumns} from app.journals j where ${rangeWhere(filter)} ${account} order by j.entry_date desc, j.posted_at desc, j.id limit :limit`,
        { from: filter.from ?? null, until: filter.until ?? null, account: filter.accountCode ?? null, limit: filter.limit },
      );
      return withLines(db, rows);
    },

    async reversalOf(id) {
      if (!isUuid(id)) return null;
      const rows = await db.all<JournalRow>(`select ${journalColumns} from app.journals j where j.reversal_of = :id`, { id });
      return (await withLines(db, rows))[0] ?? null;
    },

    async sums(range) {
      const rows = await db.all<{ account_code: string; debit: string | number; credit: string | number }>(
        `select l.account_code, sum(l.debit_cents)::text as debit, sum(l.credit_cents)::text as credit
         from app.journal_lines l join app.journals j on j.id = l.journal_id
         where ${rangeWhere(range)} group by l.account_code`,
        { from: range.from ?? null, until: range.until ?? null },
      );
      return rows.map((row): AccountSums => ({ accountCode: row.account_code, debitCents: cents(row.debit), creditCents: cents(row.credit) }));
    },

    async partySums(accountCode, party) {
      const row = await db.get<{ debit: string | null; credit: string | null }>(
        "select sum(debit_cents)::text as debit, sum(credit_cents)::text as credit from app.journal_lines where account_code = :accountCode and party = :party",
        { accountCode, party },
      );
      return { debitCents: cents(row?.debit), creditCents: cents(row?.credit) };
    },

    async cashJournals(range) {
      const rows = await db.all<JournalRow>(
        `select ${journalColumns} from app.journals j
         where j.entry_date between :from::date and :until::date
           and exists (select 1 from app.journal_lines l where l.journal_id = j.id and l.account_code like '10%')
         order by j.entry_date, j.posted_at, j.id`,
        range,
      );
      return withLines(db, rows);
    },

    async periods() {
      const rows = await db.all<{ period: string; status: string; locked_at: Date | null; locked_by: string | null; unlock_reason: string | null }>(
        "select period, status, locked_at, locked_by, unlock_reason from app.periods order by period desc",
      );
      return rows.map((row): PeriodState => ({ period: row.period, status: row.status === "locked" ? "locked" : "open", lockedAt: row.locked_at, lockedBy: row.locked_by, unlockReason: row.unlock_reason }));
    },

    async isLocked(period) {
      const row = await db.get<{ locked: boolean }>("select exists (select 1 from app.periods where period = :period and status = 'locked') as locked", { period });
      return row?.locked === true;
    },

    async lockPeriod(period, at, by) {
      const { changes } = await db.run(
        `insert into app.periods (period, status, locked_at, locked_by, updated_at) values (:period, 'locked', :at, :by, :at)
         on conflict (period) do update set status = 'locked', locked_at = :at, locked_by = :by, updated_at = :at where app.periods.status = 'open'`,
        { period, at, by },
      );
      return changes === 1;
    },

    async unlockPeriod(period, at, _by, reason) {
      const { changes } = await db.run("update app.periods set status = 'open', unlock_reason = :reason, updated_at = :at where period = :period and status = 'locked'", {
        period,
        at,
        reason,
      });
      return changes === 1;
    },

    async settings() {
      const row = await db.get<{ year_end_month: number; main_bank: string }>("select year_end_month, main_bank from app.books_settings where id");
      return row ? { yearEndMonth: Number(row.year_end_month), mainBank: row.main_bank } : { ...defaultLedgerSettings };
    },

    async saveSettings(settings, at, by) {
      await db.run("update app.books_settings set year_end_month = :yearEndMonth, main_bank = :mainBank, updated_at = :at, updated_by = :by where id", {
        ...settings,
        at,
        by: isUuid(by) ? by : null,
      });
    },
  };
}
