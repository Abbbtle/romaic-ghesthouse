import "server-only";
import type { BankAccount, BankImport, BankLine, MatchKind } from "@/lib/bookkeeping/bank";
import { storedMappingSchema } from "@/lib/bookkeeping/bookkeeping-input";
import type { BankStore } from "@/lib/bookkeeping/ports";
import type { StatementMapping } from "@/lib/bookkeeping/statement";
import { jsonParam, type Database } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type AccountRow = {
  id: string;
  name: string;
  bank_name: string;
  account_number_last4: string;
  ledger_code: string;
  statement_mapping: unknown;
  created_at: Date;
  created_by: string | null;
};

type ImportRow = {
  id: string;
  bank_account_id: string;
  file_name: string;
  imported_at: Date;
  imported_by: string | null;
  row_count: number;
  added_count: number;
  duplicate_count: number;
  skipped_count: number;
};

type LineRow = {
  id: string;
  bank_account_id: string;
  import_id: string;
  line_date: string;
  description: string;
  amount_cents: string | number;
  balance_cents: string | number | null;
  dedupe_hash: string;
  row_number: number;
  matched_journal_id: string | null;
  match_kind: string | null;
  matched_at: Date | null;
  matched_by: string | null;
  journals_made: number;
  match_reversed: boolean;
};

const accountColumns = "id, name, bank_name, account_number_last4, ledger_code, statement_mapping, created_at, created_by";
const importColumns = "id, bank_account_id, file_name, imported_at, imported_by, row_count, added_count, duplicate_count, skipped_count";
// Whether the matched journal has been reversed since, read from the ledger's own table.
const lineColumns = `l.id, l.bank_account_id, l.import_id, l.line_date, l.description, l.amount_cents, l.balance_cents, l.dedupe_hash, l.row_number,
  l.matched_journal_id, l.match_kind, l.matched_at, l.matched_by, l.journals_made,
  (l.matched_journal_id is not null and exists (select 1 from app.journals r where r.reversal_of = l.matched_journal_id)) as match_reversed`;
const toReconcile = "(l.matched_journal_id is null or exists (select 1 from app.journals r where r.reversal_of = l.matched_journal_id))";

/** JSON as stored: PGlite gives jsonb parsed, node-postgres too; a string is parsed once more to be safe. */
const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

function mappingOf(value: unknown): StatementMapping | null {
  if (value === null || value === undefined) return null;
  const parsed = storedMappingSchema.safeParse(json(value));
  // A mapping that no longer reads (an older shape) is asked for again, rather than guessed at.
  return parsed.success ? parsed.data : null;
}

const accountOf = (row: AccountRow): BankAccount => ({
  id: row.id,
  name: row.name,
  bankName: row.bank_name,
  accountNumberLast4: row.account_number_last4,
  ledgerCode: row.ledger_code,
  mapping: mappingOf(row.statement_mapping),
  createdAt: row.created_at,
  createdBy: row.created_by,
});

const importOf = (row: ImportRow): BankImport => ({
  id: row.id,
  bankAccountId: row.bank_account_id,
  fileName: row.file_name,
  importedAt: row.imported_at,
  importedBy: row.imported_by,
  rowCount: Number(row.row_count),
  addedCount: Number(row.added_count),
  duplicateCount: Number(row.duplicate_count),
  skippedCount: Number(row.skipped_count),
});

function lineOf(row: LineRow): BankLine {
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    importId: row.import_id,
    date: row.line_date,
    description: row.description,
    amountCents: Number(row.amount_cents),
    balanceCents: row.balance_cents === null ? null : Number(row.balance_cents),
    dedupeHash: row.dedupe_hash,
    rowNumber: Number(row.row_number),
    match:
      row.matched_journal_id && row.matched_at
        ? { journalId: row.matched_journal_id, kind: (row.match_kind === "created" ? "created" : "existing") as MatchKind, at: row.matched_at, by: row.matched_by }
        : null,
    matchReversed: row.match_reversed === true,
    journalsMade: Number(row.journals_made),
  };
}

/** Bank accounts, imports and statement lines in Postgres (./migrations/330-bank.ts): nothing deleted, lines only ever matched. */
export function createPostgresBankStore(db: Database): BankStore {
  return {
    async accounts() {
      return (await db.all<AccountRow>(`select ${accountColumns} from app.bank_accounts order by created_at, id`)).map(accountOf);
    },

    async account(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<AccountRow>(`select ${accountColumns} from app.bank_accounts where id = :id`, { id });
      return row ? accountOf(row) : null;
    },

    async addAccount(account, sealedNumber) {
      try {
        await db.run(
          `insert into app.bank_accounts (id, name, bank_name, account_number_sealed, account_number_last4, ledger_code, statement_mapping, created_at, created_by)
           values (:id, :name, :bankName, :sealed, :last4, :ledgerCode, :mapping, :createdAt, :createdBy)`,
          {
            id: account.id,
            name: account.name,
            bankName: account.bankName,
            sealed: sealedNumber,
            last4: account.accountNumberLast4,
            ledgerCode: account.ledgerCode,
            mapping: account.mapping ? jsonParam(account.mapping) : null,
            createdAt: account.createdAt,
            createdBy: account.createdBy,
          },
        );
        return "added";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "bank_accounts_ledger_code_unique") return "ledger-taken";
        throw error;
      }
    },

    async saveMapping(id, mapping) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.bank_accounts set statement_mapping = :mapping where id = :id", { id, mapping: jsonParam(mapping) });
      return changes === 1;
    },

    async recordImport(entry, lines) {
      return db.transaction(async (tx) => {
        // One import of an account at a time: a second waits here, then sees the first's lines.
        await tx.get("select id from app.bank_accounts where id = :id for update", { id: entry.bankAccountId });
        const hashes = lines.map((line) => line.dedupeHash);
        const known = new Set(
          (await tx.all<{ dedupe_hash: string }>("select dedupe_hash from app.bank_lines where bank_account_id = :id and dedupe_hash = any(:hashes::text[])", { id: entry.bankAccountId, hashes })).map(
            (row) => row.dedupe_hash,
          ),
        );
        const fresh: BankLine[] = [];
        for (const line of lines) {
          if (known.has(line.dedupeHash)) continue;
          known.add(line.dedupeHash);
          fresh.push(line);
        }
        const outcome = { added: fresh.length, duplicates: lines.length - fresh.length };
        await tx.run(
          `insert into app.bank_imports (${importColumns})
           values (:id, :bankAccountId, :fileName, :importedAt, :importedBy, :rowCount, :added, :duplicates, :skipped)`,
          {
            id: entry.id,
            bankAccountId: entry.bankAccountId,
            fileName: entry.fileName,
            importedAt: entry.importedAt,
            importedBy: entry.importedBy,
            rowCount: lines.length,
            added: outcome.added,
            duplicates: outcome.duplicates,
            skipped: entry.skippedCount,
          },
        );
        if (fresh.length > 0) {
          await tx.run(
            `insert into app.bank_lines (id, bank_account_id, import_id, line_date, description, amount_cents, balance_cents, dedupe_hash, row_number)
             select id, :bankAccountId, :importId, line_date, description, amount_cents, nullif(balance, '')::bigint, dedupe_hash, row_number
             from unnest(:ids::uuid[], :dates::date[], :descriptions::text[], :amounts::bigint[], :balances::text[], :hashes::text[], :rows::integer[])
               as fresh (id, line_date, description, amount_cents, balance, dedupe_hash, row_number)`,
            {
              bankAccountId: entry.bankAccountId,
              importId: entry.id,
              ids: fresh.map((line) => line.id),
              dates: fresh.map((line) => line.date),
              descriptions: fresh.map((line) => line.description),
              amounts: fresh.map((line) => line.amountCents),
              balances: fresh.map((line) => (line.balanceCents === null ? "" : String(line.balanceCents))),
              hashes: fresh.map((line) => line.dedupeHash),
              rows: fresh.map((line) => line.rowNumber),
            },
          );
        }
        return outcome;
      });
    },

    async imports(bankAccountId, limit) {
      if (!isUuid(bankAccountId)) return [];
      const rows = await db.all<ImportRow>(`select ${importColumns} from app.bank_imports where bank_account_id = :id order by imported_at desc, id desc limit :limit`, { id: bankAccountId, limit });
      return rows.map(importOf);
    },

    async lines(bankAccountId, filter) {
      if (!isUuid(bankAccountId)) return [];
      const status = filter.status === "unmatched" ? toReconcile : filter.status === "matched" ? `not ${toReconcile}` : "true";
      const rows = await db.all<LineRow>(
        `select ${lineColumns} from app.bank_lines l where l.bank_account_id = :id and ${status} order by l.line_date desc, l.row_number desc, l.id desc limit :limit`,
        { id: bankAccountId, limit: filter.limit },
      );
      return rows.map(lineOf);
    },

    async line(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<LineRow>(`select ${lineColumns} from app.bank_lines l where l.id = :id`, { id });
      return row ? lineOf(row) : null;
    },

    async lastBalancedLines(bankAccountId) {
      if (!isUuid(bankAccountId)) return [];
      const rows = await db.all<LineRow>(
        `select ${lineColumns} from app.bank_lines l
         where l.bank_account_id = :id and l.balance_cents is not null
           and l.line_date = (select max(line_date) from app.bank_lines where bank_account_id = :id and balance_cents is not null)
         order by l.row_number, l.id`,
        { id: bankAccountId },
      );
      return rows.map(lineOf);
    },

    async lineCounts(bankAccountId) {
      if (!isUuid(bankAccountId)) return { lines: 0, unmatched: 0 };
      const row = await db.get<{ lines: string | number; unmatched: string | number }>(
        `select count(*) as lines, count(*) filter (where ${toReconcile}) as unmatched from app.bank_lines l where l.bank_account_id = :id`,
        { id: bankAccountId },
      );
      return { lines: Number(row?.lines ?? 0), unmatched: Number(row?.unmatched ?? 0) };
    },

    async firstLineDate(bankAccountId) {
      if (!isUuid(bankAccountId)) return null;
      const row = await db.get<{ first: string | null }>("select min(line_date) as first from app.bank_lines where bank_account_id = :id", { id: bankAccountId });
      return row?.first ?? null;
    },

    async matchedJournals(bankAccountId, journalIds) {
      const ids = journalIds.filter(isUuid);
      if (ids.length === 0 || !isUuid(bankAccountId)) return new Map();
      const rows = await db.all<{ id: string; matched_journal_id: string }>(
        "select id, matched_journal_id from app.bank_lines where bank_account_id = :accountId and matched_journal_id = any(:ids::uuid[])",
        { accountId: bankAccountId, ids },
      );
      return new Map(rows.map((row) => [row.matched_journal_id, row.id]));
    },

    async setMatch(lineId, expectedJournalId, match, journalsMade) {
      if (!isUuid(lineId)) return "changed";
      try {
        const { changes } = await db.run(
          `update app.bank_lines
           set matched_journal_id = :journalId, match_kind = :kind, matched_at = :at, matched_by = :by, journals_made = greatest(journals_made, :made)
           where id = :id and matched_journal_id is not distinct from :expected::uuid`,
          {
            id: lineId,
            expected: expectedJournalId,
            journalId: match?.journalId ?? null,
            kind: match?.kind ?? null,
            at: match?.at ?? null,
            by: match?.by ?? null,
            made: journalsMade ?? 0,
          },
        );
        return changes === 1 ? "set" : "changed";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "bank_lines_one_per_journal") return "journal-taken";
        throw error;
      }
    },
  };
}
