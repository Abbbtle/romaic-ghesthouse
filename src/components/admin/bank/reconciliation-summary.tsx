import Link from "next/link";
import { netOn } from "@/lib/bookkeeping/bank";
import type { NotOnStatement, Reconciliation } from "@/lib/bookkeeping/bank-service";
import { formatDateShort, formatDayShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import type { IsoDate } from "@/lib/format/zoned-time";
import { cx } from "@/components/ui/cx";
import { journalPath, journalsPath } from "../books/journal-list";
import { dayLabel } from "../expenses/expense-list";
import { balanceWords, linesCount, moneyInOut } from "./bank-labels";

const shownAtOnce = 5;

function Line({ label, value, note, strong = false }: { label: string; value: string; note?: string | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
      <dt className={strong ? "font-bold text-ink" : "text-fg-2"}>
        {label}
        {note && <span className="block text-xs font-normal text-fg-3">{note}</span>}
      </dt>
      <dd className={cx("text-right whitespace-nowrap tabular-nums", strong ? "text-h4 font-bold text-ink" : "text-base text-ink")} data-numeric>
        {value}
      </dd>
    </div>
  );
}

/** Which way the books and the bank differ, in words: the books show more (or less) than the bank. */
function differenceLabel(differenceCents: number): string {
  if (differenceCents === 0) return "They match";
  return differenceCents < 0 ? "The books show more than the bank" : "The books show less than the bank";
}

/**
 * With every line matched and a difference left: the journals on the
 * account since the statements begin that no line is matched to, each
 * opening the journal; or, when there are none, where else to look.
 */
function NotOnStatementList({ found, ledgerCode, today }: { found: NotOnStatement; ledgerCode: string; today: IsoDate }) {
  const since = formatDateShort(found.from);
  if (found.journals.length === 0) {
    return (
      <p className="border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">
        Every line is matched and nothing in the books since {since} is missing from the statement, so the gap is from before then: often the account&rsquo;s opening balance
        isn&rsquo;t in the books yet. A manual journal under{" "}
        <Link href={journalsPath} className="font-bold text-link underline underline-offset-4">
          Journals
        </Link>{" "}
        can record it.
      </p>
    );
  }
  const shown = found.journals.slice(0, shownAtOnce);
  const more = found.journals.length - shown.length;
  return (
    <section aria-labelledby="not-on-statement" className="border-t border-hairline">
      <h2 id="not-on-statement" className="px-4 pt-3 text-sm font-bold text-ink lg:px-5">
        In the books since {since}, but on no statement line
      </h2>
      <ul className="divide-y divide-hairline">
        {shown.map((journal) => (
          <li key={journal.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 lg:px-5">
            <span className="grid min-w-0 gap-0.5">
              <Link href={journalPath(journal.id)} className="font-bold break-words text-link underline underline-offset-4">
                {journal.memo}
              </Link>
              <span className="text-sm text-fg-2">{dayLabel(journal.date, today)}</span>
            </span>
            <span className="shrink-0 text-right whitespace-nowrap text-ink tabular-nums" data-numeric>
              {moneyInOut(netOn(journal, ledgerCode))}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 pt-1 pb-3 text-sm text-fg-2 lg:px-5">
        {more > 0 && `And ${more} more. `}
        One the bank hasn&rsquo;t paid yet will match a line on its next statement. If one never went through this account, open it to put it right.
      </p>
    </section>
  );
}

/**
 * The statement's closing balance against the account in the books on the
 * same day, read like a receipt: the two balances, then which way they
 * differ in words (never a minus), in bold. With every line matched and a
 * difference left, what in the books has no line. When the statements carry
 * no balance, the books' balance today.
 */
export function ReconciliationSummary({
  reconciliation,
  notOnStatement,
  ledgerCode,
  today,
}: {
  reconciliation: Reconciliation;
  notOnStatement: NotOnStatement | null;
  /** The account's code in the books, to tell money in from money out. */
  ledgerCode: string;
  today: IsoDate;
}) {
  const { statement, books, differenceCents, toReconcile } = reconciliation;
  return (
    <div className="max-w-xl rounded-md border border-hairline bg-white">
      <dl className="divide-y divide-hairline">
        {statement ? (
          <>
            <Line label={`Statement balance on ${formatDayShort(statement.date)}`} value={balanceWords(statement.balanceCents)} />
            <Line label={`In the books on ${formatDayShort(books.date)}`} value={balanceWords(books.balanceCents)} />
            <Line
              label={differenceLabel(differenceCents ?? 0)}
              value={formatCents(Math.abs(differenceCents ?? 0))}
              note={differenceCents !== 0 && toReconcile > 0 ? "Match the lines below to close it." : null}
              strong
            />
          </>
        ) : (
          <Line label="In the books today" value={balanceWords(books.balanceCents)} note="The statements imported don't show a balance to compare." strong />
        )}
      </dl>
      {notOnStatement && <NotOnStatementList found={notOnStatement} ledgerCode={ledgerCode} today={today} />}
      <p className="border-t border-hairline px-4 py-2.5 text-sm text-fg-2 lg:px-5">
        {toReconcile === 0 ? "Every line imported is matched." : `${linesCount(toReconcile)} not matched yet`}
      </p>
    </div>
  );
}
