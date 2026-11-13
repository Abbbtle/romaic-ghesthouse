import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { daysBetween, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { isCashAccount, systemAccounts, type LedgerAccount } from "@/lib/ledger/accounts";
import { periodOf, reversedLines, type Journal, type JournalDraft } from "@/lib/ledger/journals";
import {
  accountNumberContext,
  bankLedgerCodes,
  bankLimits,
  closingBalance,
  fixedCounterAccount,
  lineDraft,
  lineKindNames,
  lineStatus,
  maskedNumber,
  matchWindow,
  netOn,
  rankMatches,
  unmatchSource,
  type BankAccount,
  type BankImport,
  type BankLine,
  type LineKind,
  type LineStatus,
} from "./bank";
import { bankAccountSchema, fileNameSchema, lineJournalSchema, mappingFieldsSchema } from "./bookkeeping-input";
import { parseCsv } from "./csv";
import { channelAccounts, clip } from "./expenses";
import type { BankStore, BookkeepingAccess, BooksLedger, LineFilter, SecretSealer } from "./ports";
import { columnCountOf, dedupeKeys, mappingFits, readStatement, statementLimits, type StatementMapping } from "./statement";

export type BankServiceDependencies = {
  bank: BankStore;
  ledger: BooksLedger;
  vault: SecretSealer;
  /** SHA-256 of text, hex: each statement line's dedupe key is kept as a hash. */
  sha256: (text: string) => string;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: BookkeepingAccess;
};

/** The statement's closing balance against the books' balance for the same day. */
export type Reconciliation = {
  /** From the last imported line with a balance; null when the statements carry none. */
  statement: { date: IsoDate; balanceCents: number } | null;
  /** The account in the books on the statement's day, or today when there's no statement balance. */
  books: { date: IsoDate; balanceCents: number };
  /** Statement less books; null without a statement balance. */
  differenceCents: number | null;
  lineCount: number;
  toReconcile: number;
};

export type BankAccountView = BankAccount & { reconciliation: Reconciliation };

export type LineView = BankLine & { status: LineStatus };

/**
 * Journals on the account from the day its statements begin to the
 * statement's last day that no line is matched to (a pay run the bank
 * hasn't paid yet, say), newest first. With every line matched, these are
 * what's left to explain a difference between the statement and the books.
 */
export type NotOnStatement = { from: IsoDate; until: IsoDate; journals: Journal[] };

export type BankAccountDetail = {
  account: BankAccountView;
  imports: BankImport[];
  lines: LineView[];
  /** When every line is matched but the statement and the books still differ; null otherwise. */
  notOnStatement: NotOnStatement | null;
};

export type MatchSuggestion = { journal: Journal; daysApart: number };

/** A line with what it can be matched to, or made into. */
export type LineDetail = {
  line: LineView;
  account: BankAccount;
  /** The journal it's matched to (reversed or not). */
  matched: Journal | null;
  suggestions: MatchSuggestion[];
  choices: {
    channels: { code: string; name: string }[];
    /** The owner's other cash accounts: other bank accounts, cash on hand, the gateway's clearing account. */
    transfers: { code: string; name: string }[];
    /** Every switched-on account but this one, for anything else. */
    others: { code: string; name: string }[];
  };
  /** Whether the line's month is locked (no journal can be made in it). */
  locked: boolean;
};

const accountGone = "This bank account no longer exists. Reload the page.";
const lineGone = "This statement line no longer exists. Reload the page.";
const lockedMonth = "That month is locked in the books. Reopen it on the Months page first.";
const changedMeanwhile = "This line was matched or changed meanwhile. Reload the page.";

/**
 * Bank accounts, statement imports and reconciliation (bank:manage, the
 * owner's). An account's number is sealed at rest and only its last four
 * digits are shown. Statements are read with the columns the owner chose
 * for the account; a line already imported is never kept twice. Matching a
 * line to a journal records it; a journal made from a line is reversed if
 * the line is unmatched.
 */
export function createBankService(deps: BankServiceDependencies) {
  const { bank, ledger, vault, clock, ids, audit, access } = deps;

  async function record(actor: Actor, action: string, target: { type: string; id: string }, summary: string) {
    await audit.record({ actor, category: "money", action, target, summary });
  }

  const balanceOf = (sums: { accountCode: string; debitCents: number; creditCents: number }[], code: string) => {
    const sum = sums.find((entry) => entry.accountCode === code);
    return sum ? sum.debitCents - sum.creditCents : 0;
  };

  async function reconciliation(account: BankAccount): Promise<Reconciliation> {
    const [balanced, counts] = await Promise.all([bank.lastBalancedLines(account.id), bank.lineCounts(account.id)]);
    const statement = closingBalance(balanced);
    const date = statement?.date ?? ledger.today();
    const booksCents = balanceOf(await ledger.sumsFor({ until: date }), account.ledgerCode);
    return {
      statement,
      books: { date, balanceCents: booksCents },
      differenceCents: statement ? statement.balanceCents - booksCents : null,
      lineCount: counts.lines,
      toReconcile: counts.unmatched,
    };
  }

  const viewOf = (line: BankLine): LineView => ({ ...line, status: lineStatus(line) });

  /**
   * Journals on the account from the first statement line's day until
   * `until` that move money in or out of it and no line of the account is
   * matched to. A journal and its reversal both in those dates cancel out,
   * so neither is listed.
   */
  async function journalsNotOnStatement(account: BankAccount, until: IsoDate): Promise<NotOnStatement | null> {
    const from = await bank.firstLineDate(account.id);
    if (!from || from > until) return null;
    const journals = await ledger.journals({ accountCode: account.ledgerCode, from, until, limit: bankLimits.linesShown });
    const inDates = new Set(journals.map((journal) => journal.id));
    const cancelled = new Set(journals.flatMap((journal) => (journal.reversalOf && inDates.has(journal.reversalOf) ? [journal.id, journal.reversalOf] : [])));
    const moving = journals.filter((journal) => !cancelled.has(journal.id) && netOn(journal, account.ledgerCode) !== 0);
    const matched = await bank.matchedJournals(account.id, moving.map((journal) => journal.id));
    return { from, until, journals: moving.filter((journal) => !matched.has(journal.id)) };
  }

  /** Journals that could be this line, best first. */
  async function suggestionsFor(line: BankLine, account: BankAccount): Promise<MatchSuggestion[]> {
    const window = matchWindow(line.date);
    const nearby = await ledger.journals({ accountCode: account.ledgerCode, from: window.from, until: window.until, limit: 100 });
    const sameAmount = nearby.filter((journal) => !journal.reversalOf && netOn(journal, account.ledgerCode) === line.amountCents);
    const [taken, reversed] = await Promise.all([
      bank.matchedJournals(account.id, sameAmount.map((journal) => journal.id)),
      Promise.all(sameAmount.map(async (journal) => ((await ledger.reversalOf(journal.id)) ? journal.id : null))),
    ]);
    const unavailable = new Set<string>([...[...taken.entries()].filter(([, lineId]) => lineId !== line.id).map(([journalId]) => journalId), ...reversed.filter((id): id is string => id !== null)]);
    return rankMatches(line, account.ledgerCode, sameAmount, unavailable)
      .slice(0, 5)
      .map((journal) => ({ journal, daysApart: Math.abs(daysBetween(line.date, journal.date)) }));
  }

  async function choicesFor(account: BankAccount): Promise<LineDetail["choices"]> {
    const [active, accounts] = await Promise.all([ledger.activeAccounts(), bank.accounts()]);
    const bankNames = new Map(accounts.map((other) => [other.ledgerCode, `${other.name} ${maskedNumber(other.accountNumberLast4)}`]));
    const others = active.filter((entry) => entry.code !== account.ledgerCode);
    return {
      channels: channelAccounts(active),
      transfers: others.filter((entry) => isCashAccount(entry.code)).map((entry) => ({ code: entry.code, name: bankNames.get(entry.code) ?? entry.name })),
      others: others.map((entry) => ({ code: entry.code, name: `${entry.code} ${bankNames.get(entry.code) ?? entry.name}` })),
    };
  }

  /** The other side of a journal made from a line, checked against what the kind allows; or why it can't be. */
  async function counterFor(kind: LineKind, chosen: string | undefined, line: BankLine, account: BankAccount): Promise<{ ok: true; code: string } | { ok: false; errors: Record<string, string> }> {
    const fixed = fixedCounterAccount(kind, line.amountCents);
    const choices = await choicesFor(account);
    const allowed = kind === "channel-payout" ? choices.channels : kind === "transfer" ? choices.transfers : kind === "other" ? choices.others : null;
    const code = fixed ?? chosen;
    if (!code) return { ok: false, errors: { account: "Choose the account." } };
    if (allowed && !allowed.some((choice) => choice.code === code)) return { ok: false, errors: { account: "Choose an account from the list." } };
    if (fixed && !(await ledger.activeAccounts()).some((entry: LedgerAccount) => entry.code === fixed)) {
      return { ok: false, errors: { kind: "That account is switched off in the chart. Switch it on first." } };
    }
    return { ok: true, code };
  }

  /** The sequence a made journal's source carries: "matched" is 1, "matched:3" is 3. */
  const sequenceOf = (journal: Journal): number => {
    const part = journal.source?.part ?? "";
    if (part === "matched") return 1;
    const match = /^matched:(\d+)$/.exec(part);
    return match ? Number(match[1]) : 0;
  };

  const sameLines = (a: JournalDraft["lines"], b: JournalDraft["lines"]) =>
    a.length === b.length && a.every((line, index) => line.accountCode === b[index]!.accountCode && line.debitCents === b[index]!.debitCents && line.creditCents === b[index]!.creditCents);

  return {
    async accounts(actor: Actor): Promise<BankAccountView[]> {
      access.assertCan(actor, "bank:manage");
      const accounts = await bank.accounts();
      return Promise.all(accounts.map(async (account) => ({ ...account, reconciliation: await reconciliation(account) })));
    },

    async account(actor: Actor, id: string, filter: LineFilter): Promise<BankAccountDetail | null> {
      access.assertCan(actor, "bank:manage");
      const account = await bank.account(id);
      if (!account) return null;
      const [summary, imports, lines] = await Promise.all([
        reconciliation(account),
        bank.imports(id, 5),
        bank.lines(id, { status: filter.status, limit: Math.min(Math.max(filter.limit, 1), bankLimits.linesShown) }),
      ]);
      // Every line matched, yet the balances differ: what in the books has no line?
      const { statement, toReconcile, differenceCents } = summary;
      const notOnStatement = statement && toReconcile === 0 && differenceCents ? await journalsNotOnStatement(account, statement.date) : null;
      return { account: { ...account, reconciliation: summary }, imports, lines: lines.map(viewOf), notOnStatement };
    },

    /** Adds a bank account: the first can use the books' Bank (1000); later ones get their own account in the chart. */
    async addAccount(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "bank:manage");
      const parsed = parseWith(bankAccountSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const existing = await bank.accounts();
      const used = new Set(existing.map((account) => account.ledgerCode));
      let ledgerCode: string | null = null;
      if (!used.has(systemAccounts.bank) && (await ledger.activeAccounts()).some((account) => account.code === systemAccounts.bank)) {
        ledgerCode = systemAccounts.bank;
      } else {
        const inChart = new Set((await ledger.chartAccounts()).map((account) => account.code));
        for (const code of bankLedgerCodes) {
          if (used.has(code) || inChart.has(code)) continue;
          const added = await ledger.addSystemAccount({ code, name: clip(parsed.value.name, 60), kind: "asset", system: true, active: true });
          if (added === "added") {
            ledgerCode = code;
            break;
          }
        }
      }
      if (!ledgerCode) return refusedWith("There's no room for another bank account in the chart. Ask Weberu for help.");
      const account: BankAccount = {
        id: ids.newId(),
        name: parsed.value.name,
        bankName: parsed.value.bankName,
        accountNumberLast4: parsed.value.accountNumber.slice(-4),
        ledgerCode,
        mapping: null,
        createdAt: clock.now(),
        createdBy: actor.id,
      };
      const sealed = vault.seal(parsed.value.accountNumber, accountNumberContext(account.id));
      if ((await bank.addAccount(account, sealed)) === "ledger-taken") return refusedWith("That didn't work. Reload the page and try again.");
      await record(actor, "bank.account-added", { type: "bank-account", id: account.id }, `Added bank account ${account.name} (${account.bankName} ${maskedNumber(account.accountNumberLast4)}), account ${ledgerCode} in the books`);
      return done({ id: account.id });
    },

    /**
     * Imports a statement exported as CSV, read with the columns given
     * (saved for the account, for next time). Lines already imported are
     * left alone; rows that can't be read are left out and counted.
     */
    async importStatement(actor: Actor, id: string, input: { fileName: string; text: string; mapping: unknown }): Promise<ChangeResult<{ added: number; duplicates: number; skipped: number }>> {
      access.assertCan(actor, "bank:manage");
      const account = await bank.account(id);
      if (!account) return refusedWith(accountGone);
      const parsedMapping = parseWith(mappingFieldsSchema, input.mapping);
      if (!parsedMapping.ok) return refused(parsedMapping.errors);
      const mapping: StatementMapping = parsedMapping.value;
      if (new TextEncoder().encode(input.text).length > statementLimits.maxBytes) return refused({ file: "That file is larger than 1 MB. Export a shorter period from your bank." });
      const csv = parseCsv(input.text, mapping.separator, statementLimits.maxRows + mapping.skipRows + 1);
      if (!csv.ok) {
        return refused({
          file: csv.problem === "too-many-rows" ? `That file has more than ${statementLimits.maxRows.toLocaleString("en-ZA")} rows. Export a shorter period from your bank.` : `Row ${csv.row} opens a quote that never closes. Check the file, or try the other separator.`,
        });
      }
      if (!mappingFits(mapping, columnCountOf(csv.rows))) return refused({ form: "Some of the columns chosen aren't in this file. Check the columns, or the separator." });
      const reading = readStatement(csv.rows, mapping);
      if (reading.lines.length === 0) {
        const first = reading.problems[0];
        return refused({ file: first ? `No lines could be read. Row ${first.row}: ${first.reason}.` : "There are no lines in this file." });
      }
      const fileName = fileNameSchema.parse(input.fileName);
      const importId = ids.newId();
      const keys = dedupeKeys(reading.lines);
      const lines: BankLine[] = reading.lines.map((line, index) => ({
        id: ids.newId(),
        bankAccountId: id,
        importId,
        date: line.date,
        description: line.description,
        amountCents: line.amountCents,
        balanceCents: line.balanceCents,
        dedupeHash: deps.sha256(keys[index]!),
        rowNumber: line.row,
        match: null,
        matchReversed: false,
        journalsMade: 0,
      }));
      const outcome = await bank.recordImport(
        { id: importId, bankAccountId: id, fileName, importedAt: clock.now(), importedBy: actor.id, rowCount: lines.length, skippedCount: reading.problems.length },
        lines,
      );
      if (JSON.stringify(account.mapping) !== JSON.stringify(mapping)) await bank.saveMapping(id, mapping);
      await record(
        actor,
        "bank.statement-imported",
        { type: "bank-account", id },
        `Imported ${fileName} into ${account.name}: ${outcome.added} new ${outcome.added === 1 ? "line" : "lines"}, ${outcome.duplicates} already there${reading.problems.length > 0 ? `, ${reading.problems.length} rows left out` : ""}`,
      );
      return done({ added: outcome.added, duplicates: outcome.duplicates, skipped: reading.problems.length });
    },

    async line(actor: Actor, lineId: string): Promise<LineDetail | null> {
      access.assertCan(actor, "bank:manage");
      const line = await bank.line(lineId);
      if (!line) return null;
      const account = await bank.account(line.bankAccountId);
      if (!account) return null;
      const status = lineStatus(line);
      const [matched, suggestions, choices, locked] = await Promise.all([
        line.match ? ledger.journal(line.match.journalId) : Promise.resolve(null),
        status === "matched" ? Promise.resolve([]) : suggestionsFor(line, account),
        choicesFor(account),
        ledger.periodLocked(periodOf(line.date)),
      ]);
      return { line: viewOf(line), account, matched, suggestions, choices, locked };
    },

    /** Matches a line to a journal already in the books: on its account, for the same amount the same way, within a month of it. */
    async matchJournal(actor: Actor, lineId: string, journalId: string): Promise<ChangeResult> {
      access.assertCan(actor, "bank:manage");
      const line = await bank.line(lineId);
      if (!line) return refusedWith(lineGone);
      if (lineStatus(line) === "matched") return refusedWith("This line is already matched. Unmatch it first.");
      const account = await bank.account(line.bankAccountId);
      if (!account) return refusedWith(accountGone);
      const journal = await ledger.journal(journalId);
      if (!journal) return refusedWith("That journal isn't in the books. Reload the page.");
      if (netOn(journal, account.ledgerCode) !== line.amountCents) return refusedWith(`That journal doesn't move ${formatCents(Math.abs(line.amountCents))} ${line.amountCents > 0 ? "into" : "out of"} this account.`);
      if (Math.abs(daysBetween(line.date, journal.date)) > 31) return refusedWith("That journal is dated more than a month from the line.");
      if (journal.reversalOf || (await ledger.reversalOf(journal.id))) return refusedWith("That journal was reversed, so it can't be matched.");
      const outcome = await bank.setMatch(lineId, line.match?.journalId ?? null, { journalId, kind: "existing", at: clock.now(), by: actor.id });
      if (outcome === "journal-taken") return refusedWith("That journal is already matched to another line on this account.");
      if (outcome === "changed") return refusedWith(changedMeanwhile);
      await record(actor, "bank.line-matched", { type: "bank-line", id: lineId }, `Matched ${formatCents(line.amountCents)} on ${line.date} (${account.name}) to "${journal.memo}"`);
      return done();
    },

    /** Makes a journal from a line (a channel's payout, the owner's money, bank charges, a transfer, another account) and matches it. */
    async makeJournal(actor: Actor, lineId: string, input: unknown): Promise<ChangeResult<{ journalId: string }>> {
      access.assertCan(actor, "bank:manage");
      const parsed = parseWith(lineJournalSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const line = await bank.line(lineId);
      if (!line) return refusedWith(lineGone);
      if (lineStatus(line) === "matched") return refusedWith("This line is already matched. Unmatch it first.");
      const account = await bank.account(line.bankAccountId);
      if (!account) return refusedWith(accountGone);
      if (await ledger.periodLocked(periodOf(line.date))) return refusedWith(lockedMonth);
      const counter = await counterFor(parsed.value.kind, parsed.value.account, line, account);
      if (!counter.ok) return refused(counter.errors);

      // A journal from an earlier try (a double tap, a lost answer) is used again; one reversed, or for something else, is passed over.
      let sequence = line.journalsMade + 1;
      let journal: Journal | null = null;
      for (let attempt = 0; attempt < 5 && !journal; attempt += 1) {
        const draft = lineDraft(line, account.ledgerCode, counter.code, parsed.value.kind, sequence);
        const result = await ledger.postSystem(draft, { by: actor });
        if (result.status === "refused") return refusedWith(result.problem);
        if (result.status === "exists") {
          const reversed = await ledger.reversalOf(result.journal.id);
          const taken = (await bank.matchedJournals(account.id, [result.journal.id])).get(result.journal.id);
          if (reversed || (taken && taken !== line.id) || !sameLines(result.journal.lines, draft.lines)) {
            if (!reversed && !taken) {
              await ledger.postSystem(
                { date: result.journal.date, memo: `Reverses "${result.journal.memo}": not used`, source: unmatchSource(line.id, sequence), reversalOf: result.journal.id, lines: reversedLines(result.journal.lines) },
                { by: actor },
              );
            }
            sequence += 1;
            continue;
          }
        }
        journal = result.journal;
      }
      if (!journal) return refusedWith("That didn't work. Reload the page and try again.");
      const outcome = await bank.setMatch(lineId, line.match?.journalId ?? null, { journalId: journal.id, kind: "created", at: clock.now(), by: actor.id }, sequence);
      if (outcome !== "set") {
        const now = await bank.line(lineId);
        if (now?.match?.journalId === journal.id) return done({ journalId: journal.id });
        return refusedWith(changedMeanwhile);
      }
      await record(
        actor,
        "bank.line-journal-made",
        { type: "bank-line", id: lineId },
        `Recorded ${formatCents(line.amountCents)} on ${line.date} (${account.name}) as ${lineKindNames[parsed.value.kind].toLowerCase()}, account ${counter.code}`,
      );
      return done({ journalId: journal.id });
    },

    /**
     * Unmatches a line, while its journal isn't reversed. A journal made
     * from the line is reversed (on its own date while that month is open);
     * a journal that was already in the books is left as it is.
     */
    async unmatch(actor: Actor, lineId: string): Promise<ChangeResult> {
      access.assertCan(actor, "bank:manage");
      const line = await bank.line(lineId);
      if (!line || !line.match) return refusedWith("This line isn't matched. Reload the page.");
      if (line.matchReversed) return refusedWith("Its journal was already reversed. Match the line again instead.");
      const journal = await ledger.journal(line.match.journalId);
      if (!journal) return refusedWith("Its journal isn't in the books. Reload the page.");
      if (line.match.kind === "created") {
        if (await ledger.reversalOf(journal.id)) return refusedWith("Its journal was already reversed. Match the line again instead.");
        const result = await ledger.postSystem(
          { date: journal.date, memo: `Reverses "${journal.memo}": unmatched from the statement`, source: unmatchSource(line.id, sequenceOf(journal) || line.journalsMade), reversalOf: journal.id, lines: reversedLines(journal.lines) },
          { by: actor },
        );
        if (result.status === "refused") return refusedWith(result.problem);
      }
      const outcome = await bank.setMatch(lineId, journal.id, null);
      if (outcome !== "set") return refusedWith(changedMeanwhile);
      await record(actor, "bank.line-unmatched", { type: "bank-line", id: lineId }, `Unmatched ${formatCents(line.amountCents)} on ${line.date} from "${journal.memo}"${line.match.kind === "created" ? " and reversed it" : ""}`);
      return done();
    },

    /** A line as the expense form needs it, to record money out as an expense: its account, day, amount and description. */
    async lineForExpense(actor: Actor, lineId: string): Promise<{ line: BankLine; account: BankAccount } | null> {
      access.assertCan(actor, "bank:manage");
      const line = await bank.line(lineId);
      if (!line || line.amountCents >= 0 || lineStatus(line) === "matched") return null;
      const account = await bank.account(line.bankAccountId);
      return account ? { line, account } : null;
    },
  };
}

export type BankService = ReturnType<typeof createBankService>;
