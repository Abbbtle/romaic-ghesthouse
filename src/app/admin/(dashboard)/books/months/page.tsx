import type { Metadata } from "next";
import { earliestPeriod, monthHasEnded, monthsNewestFirst } from "@/components/admin/books/book-months";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksSettingsForm } from "@/components/admin/books/books-settings-form";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import { earliestJournalMonthBefore } from "@/components/admin/books/journal-reads";
import { LockMonthButton, ReopenMonthButton } from "@/components/admin/books/month-actions";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-pill";
import type { FieldOption } from "@/components/ui/fields";
import { can } from "@/lib/accounts/access";
import { formatDateShort, formatMonth } from "@/lib/format/date-time";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { systemAccounts } from "@/lib/ledger/accounts";
import { periodOf } from "@/lib/ledger/journals";
import type { PeriodState } from "@/lib/ledger/ports";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";
import { lockMonth, reopenMonth, saveBooksSettings } from "../actions";
import { teamNames } from "../team-names";

export const metadata: Metadata = { title: "Months" };

/** What a month's row says under it, in words. */
function monthDetail(state: PeriodState | undefined, ended: boolean, names: ReadonlyMap<string, string>): string | null {
  if (state?.status === "locked") {
    const when = state.lockedAt ? ` on ${formatDateShort(zonedToday(state.lockedAt, businessTimeZone))}` : "";
    const who = state.lockedBy ? ` by ${names.get(state.lockedBy) ?? "a team member"}` : "";
    return `Locked${when}${who}. Nothing more can be posted in it.`;
  }
  if (state?.unlockReason) return `Reopened: ${state.unlockReason}`;
  return ended ? null : "This month is still running. It can be locked once it ends.";
}

/**
 * The months of the books (Pattern: settings list), from the start of the
 * financial year (or the earliest journal, if that's earlier) to this month,
 * each Open or Locked. A month is locked once its returns are filed, and
 * reopened only with a reason (periods:lock). Then the books' settings: when
 * the financial year ends, and the main bank account (ledger:post).
 */
export default async function MonthsPage() {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const ledger = ledgerService();
  const today = ledger.today();
  const [year, periods, settings, chart] = await Promise.all([ledger.financialYear(actor, today), ledger.periods(actor), ledger.settings(actor), ledger.chart(actor)]);
  const earliestJournal = await earliestJournalMonthBefore(ledger, actor, year.start);
  const thisMonth = periodOf(today);
  const first = earliestPeriod([periodOf(year.start), earliestJournal, ...periods.map((period) => period.period).filter((period) => period <= thisMonth)]) ?? thisMonth;
  const months = monthsNewestFirst(first, thisMonth);
  const states = new Map(periods.map((period) => [period.period, period]));
  const names = periods.some((period) => period.status === "locked" && period.lockedBy) ? await teamNames(actor) : new Map<string, string>();
  const canLock = can(actor, "periods:lock");
  const canPost = can(actor, "ledger:post");
  const bankOptions: FieldOption[] = chart
    .filter(
      (account) =>
        (account.code === settings.mainBank || (account.active && account.kind === "asset" && /^10\d\d$/.test(account.code))) &&
        account.code !== systemAccounts.cashOnHand &&
        account.code !== systemAccounts.gatewayClearing,
    )
    .map((account) => ({ value: account.code, label: `${account.code} ${account.name}` }));
  const mainBank = chart.find((account) => account.code === settings.mainBank);
  const yearEndName = formatMonth(`2000-${String(settings.yearEndMonth).padStart(2, "0")}`).split(" ")[0];

  return (
    <>
      <PageHeader title="Months" description="Lock a month once its returns are filed, so nothing more can be posted in it." />
      <BooksTabs current="months" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-8">
        <section aria-labelledby="months-title" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="months-title" className="text-h3 font-bold text-ink">
              Months
            </h2>
            <p className="max-w-[62ch] text-sm text-fg-2">
              This financial year runs from {formatDateShort(year.start)} to {formatDateShort(year.end)}. A payment or check-out recorded later for a locked month is
              posted with that day&apos;s date instead.
            </p>
          </div>
          <ul className="divide-y divide-hairline rounded-md border border-hairline bg-white">
            {months.map((month) => {
              const state = states.get(month);
              const locked = state?.status === "locked";
              const ended = monthHasEnded(month, today);
              const label = formatMonth(month);
              const detail = monthDetail(state, ended, names);
              return (
                <li key={month} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink">{label}</span>
                    <StatusPill tone={locked ? "info" : "neutral"}>{locked ? "Locked" : "Open"}</StatusPill>
                  </p>
                  <div className="flex justify-end">
                    {canLock && locked && <ReopenMonthButton period={month} label={label} action={reopenMonth} />}
                    {canLock && !locked && ended && <LockMonthButton period={month} label={label} action={lockMonth} />}
                  </div>
                  {detail && <p className="col-span-2 text-sm break-words text-fg-2">{detail}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="books-settings-title" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="books-settings-title" className="text-h3 font-bold text-ink">
              Settings
            </h2>
            <p className="max-w-[62ch] text-sm text-fg-2">The financial year sets the dates reports start from. Changing either setting doesn&apos;t change journals already posted.</p>
          </div>
          <div className="rounded-md border border-hairline bg-white p-4 lg:p-5">
            {canPost ? (
              <BooksSettingsForm action={saveBooksSettings} yearEndMonth={settings.yearEndMonth} mainBank={settings.mainBank} bankOptions={bankOptions} />
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-0.5">
                  <dt className="text-sm text-fg-3">The financial year ends in</dt>
                  <dd className="text-ink">{yearEndName}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-sm text-fg-3">Main bank account</dt>
                  <dd className="text-ink">{mainBank ? `${mainBank.code} ${mainBank.name}` : settings.mainBank}</dd>
                </div>
              </dl>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
