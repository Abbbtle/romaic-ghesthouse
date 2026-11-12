import { addDays, businessTimeZone, zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import { periodOf, type Journal } from "@/lib/ledger/journals";
import type { LedgerService } from "@/lib/ledger/ledger-service";

const pageSize = 200;

/**
 * Which of `shown` have been reversed. A reversal is dated on or after the
 * day the journal it undoes was posted, so one read from the earliest such
 * day finds them all, unless there are more journals since then than one
 * read holds; then each journal not yet known is asked about on its own.
 */
export async function reversedAmong(ledger: Pick<LedgerService, "journals" | "journal">, actor: Actor, shown: readonly Journal[]): Promise<Set<string>> {
  const reversed = new Set(shown.flatMap((journal) => (journal.reversalOf ? [journal.reversalOf] : [])));
  const candidates = shown.filter((journal) => !journal.reversalOf);
  if (candidates.length === 0) return reversed;
  const earliest = candidates.reduce((day, journal) => {
    const posted = zonedToday(journal.postedAt, businessTimeZone);
    const first = journal.date < posted ? journal.date : posted;
    return first < day ? first : day;
  }, candidates[0]!.date);
  const since = await ledger.journals(actor, { from: earliest, limit: pageSize });
  for (const journal of since) if (journal.reversalOf) reversed.add(journal.reversalOf);
  if (since.length < pageSize) return reversed;
  const unknown = candidates.filter((journal) => !reversed.has(journal.id));
  const details = await Promise.all(unknown.map((journal) => ledger.journal(actor, journal.id)));
  for (const detail of details) if (detail?.reversedBy) reversed.add(detail.journal.id);
  return reversed;
}

/**
 * The month of the earliest journal dated before `before`, or null when
 * there's none. Journals come newest first, so it reads back a page at a
 * time (at most ten pages: the earliest of those, beyond that).
 */
export async function earliestJournalMonthBefore(ledger: Pick<LedgerService, "journals">, actor: Actor, before: IsoDate): Promise<string | null> {
  let until = addDays(before, -1);
  let earliest: IsoDate | null = null;
  for (let read = 0; read < 10; read += 1) {
    const page = await ledger.journals(actor, { until, limit: pageSize });
    if (page.length === 0) break;
    earliest = page[page.length - 1]!.date;
    if (page.length < pageSize) break;
    until = addDays(earliest, -1);
  }
  return earliest ? periodOf(earliest) : null;
}
