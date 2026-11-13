import { Download, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { booksTabsAllowed } from "@/components/admin/books/books-access";
import { BooksTabs } from "@/components/admin/books/books-tabs";
import {
  coversRange,
  exportHref,
  preparedNote,
  printHref,
  reportDescriptions,
  reportHref,
  reportKinds,
  reportNames,
  reportPeriodLabel,
  reportPresets,
  reportQueryFrom,
  reportsPath,
  reportTableFor,
  type ReportKind,
} from "@/components/admin/books/report-model";
import { hasFigures, ReportTableView } from "@/components/admin/books/report-table";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { Tabs } from "@/components/admin/tabs";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { inputClasses, labelClasses } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";

export const metadata: Metadata = { title: "Reports" };

/** What each statement needs said about how it's worked out, in plain words. */
const reportNotes: Record<ReportKind, string> = {
  "profit-and-loss": "Income is counted on the day a guest checks out, not when they pay.",
  "balance-sheet": "The owner's share includes every profit or loss the business has made, on two lines: from before this financial year began, and from this year so far.",
  "cash-flow": "Cash means the bank accounts, cash on hand and the payment gateway. Money moved between them counts as both in and out.",
  "trial-balance": "Each account's balance on the day, on the side it falls.",
};

const dateInput = inputClasses("compact", "mt-1.5 tabular-nums");

/**
 * The statements (Pattern: analytics, as tables): profit and loss, balance
 * sheet, cash flow and trial balance, one at a time (?report=), for the
 * financial year so far unless other dates are chosen. Whoever may export
 * (finance:export: the owner) downloads a CSV or opens a print view. For
 * the owner (ledger:view).
 */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/books/reports">) {
  const actor = await requireDashboardActor({ permission: "ledger:view" });
  const ledger = ledgerService();
  const today = ledger.today();
  const settings = await ledger.settings(actor);
  const context = { today, yearEndMonth: settings.yearEndMonth };
  const { query, corrected } = reportQueryFrom(await searchParams, context);
  const table = await reportTableFor(ledger, actor, query);
  const canExport = can(actor, "finance:export");
  const period = reportPeriodLabel(query);

  return (
    <>
      <PageHeader title="Reports" description={preparedNote} />
      <BooksTabs current="reports" allowed={booksTabsAllowed(actor)} />
      <div className="grid max-w-admin gap-5">
        <Tabs label="Statements" current={reportHref(query)} items={reportKinds.map((kind) => ({ href: reportHref({ ...query, kind }), label: reportNames[kind] }))} />

        <form action={reportsPath} aria-label="Dates" className="grid gap-4 rounded-md border border-hairline bg-white p-4 lg:p-5">
          <input type="hidden" name="report" value={query.kind} />
          <div className="grid gap-4 sm:grid-cols-[10rem_10rem_auto] sm:items-end">
            {coversRange(query.kind) ? (
              <>
                <div>
                  <label htmlFor="report-from" className={labelClasses}>
                    From
                  </label>
                  <input id="report-from" name="from" type="date" required defaultValue={query.from} className={dateInput} />
                </div>
                <div>
                  <label htmlFor="report-until" className={labelClasses}>
                    Until
                  </label>
                  <input id="report-until" name="until" type="date" required defaultValue={query.until} className={dateInput} />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="report-at" className={labelClasses}>
                  On
                </label>
                <input id="report-at" name="at" type="date" required defaultValue={query.until} className={dateInput} />
              </div>
            )}
            <div>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
                Show
              </button>
            </div>
          </div>
          <nav aria-label="Other dates" className="flex flex-wrap gap-x-5 gap-y-1">
            {reportPresets(query.kind, context).map((preset) => (
              <Link key={preset.label} href={reportHref(preset.query)} className="inline-flex min-h-11 items-center text-sm font-bold text-link underline underline-offset-4 pointer-fine:min-h-9">
                {preset.label}
              </Link>
            ))}
          </nav>
        </form>

        {corrected && <Notice tone="warning">Some of the dates asked for couldn&apos;t be used, so this shows {period}.</Notice>}

        <Panel
          title={reportNames[query.kind]}
          description={`${period} · ${reportDescriptions[query.kind]}`}
          flush
          actions={
            canExport ? (
              <>
                {/* No download attribute: when the password and code are due again, the link must follow to that page (the route names the file itself). */}
                <ButtonAnchor href={exportHref(query)} size="sm" variant="secondary" icon={<Download aria-hidden="true" />}>
                  Download CSV
                </ButtonAnchor>
                <ButtonLink href={printHref(query)} size="sm" variant="ghost" icon={<Printer aria-hidden="true" />}>
                  Print
                </ButtonLink>
              </>
            ) : undefined
          }
        >
          {!hasFigures(table) && <p className="border-b border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">Nothing has been posted for these dates yet.</p>}
          <ReportTableView table={table} caption={`${reportNames[query.kind]}, ${period}`} />
          <div className="grid gap-2 border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">
            {table.check && (
              <p className="flex flex-wrap items-center gap-2">
                <StatusPill tone={table.check.ok ? "success" : "danger"}>{table.check.ok ? "Balances" : "Doesn't balance"}</StatusPill>
                {table.check.text}
              </p>
            )}
            <p>{reportNotes[query.kind]}</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
