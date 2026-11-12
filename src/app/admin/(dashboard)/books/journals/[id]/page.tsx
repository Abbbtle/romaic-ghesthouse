import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { journalPath, journalsPath } from "@/components/admin/books/journal-list";
import { ReverseJournalButton } from "@/components/admin/books/reverse-journal-button";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { Cell, HeaderCell, TableFrame } from "@/components/admin/table";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { formatDateShort, formatDayLong, formatMonth, formatTime } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { totalsOf, type Journal } from "@/lib/ledger/journals";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";
import { reverseJournal } from "../../actions";
import { teamNames } from "../../team-names";

export const metadata: Metadata = { title: "Journal" };

const bookingParty = /^booking:([0-9a-f-]{36})$/i;

/** A link to the journal on the other side of a reversal: "Deposit for RG-B2C3D, Thu 12 Nov 2026". */
function JournalLink({ journal }: { journal: Journal }) {
  return (
    <Link href={journalPath(journal.id)} className="font-bold text-link underline underline-offset-4">
      {journal.memo}
    </Link>
  );
}

/**
 * One journal (Pattern: detail): its lines with each account, debit, credit
 * and note (a booking's line links to the booking), who posted it and when,
 * and what it reverses or is reversed by. Reverse, for whoever may post,
 * asks why and posts the reversal dated today. For the owner (ledger:view).
 */
export default async function JournalPage({ params, searchParams }: PageProps<"/admin/books/journals/[id]">) {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const { id } = await params;
  const { notice } = await searchParams;
  const ledger = ledgerService();
  const [found, chart, periods] = await Promise.all([ledger.journal(actor, id), ledger.chart(actor), ledger.periods(actor)]);
  if (!found) notFound();
  const { journal, reversedBy, reverses } = found;
  const names = journal.postedBy ? await teamNames(actor) : new Map<string, string>();
  const accounts = new Map(chart.map((account) => [account.code, account]));
  const totals = totalsOf(journal.lines);
  const locked = periods.some((period) => period.period === journal.period && period.status === "locked");
  // Automatic journals are corrected where they came from (the ledger refuses reversing them here).
  const automatic = journal.source !== null && journal.source.type !== "manual";
  const canReverse = can(actor, "ledger:post") && !journal.reversalOf && !reversedBy && !automatic;
  const postedBy = journal.postedBy === null ? "Posted automatically" : `Posted by ${names.get(journal.postedBy) ?? "a team member"}`;

  return (
    <>
      <PageHeader
        title="Journal"
        description={<span className="font-bold break-words text-ink">{journal.memo}</span>}
        back={{ href: journalsPath, label: "Journals" }}
        actions={canReverse ? <ReverseJournalButton journalId={journal.id} today={formatDayLong(ledger.today())} fromPayment={journal.source?.type === "payment"} action={reverseJournal} /> : undefined}
      />
      <div className="grid max-w-admin gap-6">
        {notice === "posted" && <Notice tone="success">Journal posted.</Notice>}

        {(reverses || reversedBy) && (
          <div className="grid gap-2 rounded-md border border-hairline bg-white p-4 lg:p-5">
            {reverses && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusPill tone="info">Reversal</StatusPill>
                <span>
                  This undoes <JournalLink journal={reverses} /> from {formatDayLong(reverses.date)}.
                </span>
              </p>
            )}
            {reversedBy && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusPill>Reversed</StatusPill>
                <span>
                  Undone on {formatDayLong(reversedBy.date)} by <JournalLink journal={reversedBy} />.
                </span>
              </p>
            )}
          </div>
        )}

        <Panel title="Details">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-0.5">
              <dt className="text-sm text-fg-3">Date</dt>
              <dd className="text-ink">{formatDayLong(journal.date)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-sm text-fg-3">In the books for</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                {formatMonth(journal.period)}
                {locked && <StatusPill>Locked</StatusPill>}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-sm text-fg-3">Posted</dt>
              <dd className="text-ink">
                {postedBy} on {formatDateShort(zonedToday(journal.postedAt, businessTimeZone))} at {formatTime(journal.postedAt, businessTimeZone)}
              </dd>
            </div>
          </dl>
        </Panel>

        <section aria-labelledby="journal-lines-title" className="grid min-w-0 gap-3">
          <h2 id="journal-lines-title" className="text-h3 font-bold text-ink">
            Lines
          </h2>
          <TableFrame caption={`The journal's lines: ${journal.memo}`} minWidth="22rem" className="min-w-0">
            <thead>
              <tr>
                <HeaderCell>Account</HeaderCell>
                <HeaderCell align="right">Debit</HeaderCell>
                <HeaderCell align="right">Credit</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {journal.lines.map((line, index) => {
                const booking = line.party ? bookingParty.exec(line.party)?.[1] : undefined;
                return (
                  <tr key={index}>
                    <Cell>
                      <span className="block">
                        <span className="mr-2 text-sm text-fg-3 tabular-nums">{line.accountCode}</span>
                        <span className="text-ink">{accounts.get(line.accountCode)?.name ?? "Account not in the chart"}</span>
                      </span>
                      {line.memo && <span className="mt-0.5 block text-sm text-fg-2">{line.memo}</span>}
                      {booking && (
                        <Link href={`${adminRoutes.bookings}/${booking}`} className="mt-0.5 inline-flex min-h-9 items-center text-sm font-bold text-link underline underline-offset-4">
                          Open the booking
                        </Link>
                      )}
                    </Cell>
                    <Cell align="right">{line.debitCents > 0 ? <span data-numeric>{formatCents(line.debitCents)}</span> : null}</Cell>
                    <Cell align="right">{line.creditCents > 0 ? <span data-numeric>{formatCents(line.creditCents)}</span> : null}</Cell>
                  </tr>
                );
              })}
              <tr className="font-bold">
                <Cell className="border-t-2 border-ink">Totals</Cell>
                <Cell align="right" className="border-t-2 border-ink">
                  <span data-numeric>{formatCents(totals.debitCents)}</span>
                </Cell>
                <Cell align="right" className="border-t-2 border-ink">
                  <span data-numeric>{formatCents(totals.creditCents)}</span>
                </Cell>
              </tr>
            </tbody>
          </TableFrame>
          {canReverse && <p className="text-sm text-fg-2">A posted journal can&apos;t be changed. To correct it, reverse it and post it again with the right figures.</p>}
          {automatic && !journal.reversalOf && (
            <p className="text-sm text-fg-2">
              This journal was posted automatically. To correct it, change what it came from (void the payment or expense, or unmatch the bank line), and the books follow.
            </p>
          )}
          {journal.reversalOf && <p className="text-sm text-fg-2">A reversal can&apos;t itself be reversed. To bring the original back, post it again.</p>}
        </section>
      </div>
    </>
  );
}
