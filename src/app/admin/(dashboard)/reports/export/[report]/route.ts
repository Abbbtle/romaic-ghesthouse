import type { NextRequest } from "next/server";
import {
  asOfLabel,
  balancesCsv,
  channelsCsv,
  cleaningCsv,
  csvPreamble,
  downloadRequirement,
  exportFileName,
  isReportKind,
  isRevenueReport,
  movementsCsv,
  occupancyCsv,
  parseRangeQuery,
  rangeLabel,
  ratesCsv,
  type ReportKind,
} from "@/components/admin/reports/report-model";
import { can } from "@/lib/accounts/access";
import { csvDocument, type CsvValue } from "@/lib/format/csv";
import type { Actor } from "@/lib/kernel/actor";
import type { ReportRange } from "@/lib/reports/report-range";
import { routeDashboardActor } from "@/server/admin-session";
import { reportService } from "@/server/reports";
import { getSiteContent } from "@/server/site-content";

const plain = (message: string, status: number) =>
  new Response(message, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });

/** A report's figures as spreadsheet rows (after the preamble). The service checks the actor may see them. */
async function rowsFor(kind: ReportKind, actor: Actor, range: ReportRange): Promise<CsvValue[][]> {
  const reports = reportService();
  switch (kind) {
    case "occupancy":
      return occupancyCsv((await reports.operations(actor, range)).occupancy);
    case "arrivals-departures":
      return movementsCsv((await reports.operations(actor, range)).movements);
    case "cleaning":
      return cleaningCsv((await reports.operations(actor, range)).cleaning);
    case "rates":
      return ratesCsv((await reports.revenue(actor, range)).revenue);
    case "channels":
      return channelsCsv((await reports.revenue(actor, range)).channels);
    case "still-to-pay":
      return balancesCsv((await reports.balances(actor)).balances);
  }
}

/**
 * A report as a CSV file: /admin/reports/export/<report>?from=&until=
 * (this month when left out; still-to-pay is as of today). Operations
 * reports go to whoever sees them (reports:operations: the owner and
 * sales); money reports only to someone who may take money figures out of
 * the dashboard (finance:export and reports:revenue: the owner), after
 * their password and code in the last 15 minutes. Anyone else gets 401 or
 * 403 (admin and staff always), and the file is never cached. Cells that
 * a spreadsheet would run as formulas are written as text (csvDocument).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/admin/reports/export/[report]">): Promise<Response> {
  const { report } = await params;
  if (!isReportKind(report)) {
    // Even "there's no such report" is only for someone who sees reports.
    const access = await routeDashboardActor({ permission: "reports:operations" });
    return "response" in access ? access.response : plain("There's no such report.", 404);
  }
  const access = await routeDashboardActor(downloadRequirement(report));
  if ("response" in access) return access.response;
  const { actor } = access;
  if (isRevenueReport(report) && !(can(actor, "reports:revenue") && can(actor, "finance:export"))) return plain("Only the owner can download money reports.", 403);

  const reports = reportService();
  const context = await reports.dates(actor);
  const range = report === "still-to-pay" ? { from: context.today, until: context.today } : parseRangeQuery(Object.fromEntries(request.nextUrl.searchParams), context);
  if (!range) return plain("Choose dates like 2026-11-01, with the start before the end and a year at most between them.", 400);

  const [rows, content] = await Promise.all([rowsFor(report, actor, range), getSiteContent()]);
  const when = report === "still-to-pay" ? asOfLabel(context.today) : rangeLabel(range);
  return new Response(csvDocument([...csvPreamble(report, content.site.businessName, when), ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(report, range, context.today)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
