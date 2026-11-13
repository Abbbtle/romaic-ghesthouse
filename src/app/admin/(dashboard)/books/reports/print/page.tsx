import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PrintableReport } from "@/components/admin/books/printable-report";
import { reportHref, reportNames, reportPeriodLabel, reportQueryFrom, reportTableFor } from "@/components/admin/books/report-model";
import { ReportTableView } from "@/components/admin/books/report-table";
import { PrintButton } from "@/components/admin/money/print-button";
import { PageHeader } from "@/components/admin/page-header";
import { can } from "@/lib/accounts/access";
import { formatDateShort, formatTime } from "@/lib/format/date-time";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { adminPaths } from "@/server/admin-paths";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { ledgerService } from "@/server/ledger";
import { getSiteContent } from "@/server/site-content";

export const metadata: Metadata = { title: "Print a report" };

/**
 * A statement as a page to print or save as a PDF, with the business's
 * name, the dates and the line saying who it's for. For whoever may both
 * read the books and take them out of the dashboard (ledger:view and
 * finance:export: the owner).
 */
export default async function ReportPrintPage({ searchParams }: PageProps<"/admin/books/reports/print">) {
  // A print view is an export: it asks for a recent step-up (roles.md).
  const actor = await requireDashboardActor({ permission: "finance:export", stepUp: true });
  if (!can(actor, "ledger:view")) redirect(`${adminPaths.home}?notice=not-allowed`);
  const ledger = ledgerService();
  const today = ledger.today();
  const settings = await ledger.settings(actor);
  const { query } = reportQueryFrom(await searchParams, { today, yearEndMonth: settings.yearEndMonth });
  const [table, content, requestHeaders] = await Promise.all([reportTableFor(ledger, actor, query), getSiteContent(), headers()]);
  const name = reportNames[query.kind];
  const period = reportPeriodLabel(query);
  const now = clock.now();

  return (
    <>
      <PageHeader title={name} description={period} back={{ href: reportHref(query), label: "Reports" }} actions={<PrintButton />} />
      <div className="grid max-w-admin gap-6">
        <PrintableReport
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          businessName={content.site.businessName}
          title={name}
          period={period}
          printedAt={`${formatDateShort(today)} at ${formatTime(now, businessTimeZone)}`}
        >
          <ReportTableView table={table} caption={`${name}, ${period}`} />
          {table.check && <p className="px-4 text-sm text-fg-2 lg:px-5">{table.check.text}</p>}
        </PrintableReport>
      </div>
    </>
  );
}
