import type { Metadata } from "next";
import { CleaningPanel, MovementsPanel, OccupancyPanel } from "@/components/admin/reports/operations-panels";
import { RangeControls, RangeHeading, ReportTabs } from "@/components/admin/reports/report-frame";
import {
  exportHref,
  houseSummary,
  operationsHref,
  rangeLabel,
  rangePresets,
  rangeQueryFrom,
  reportsPath,
  revenueHref,
  sameRange,
} from "@/components/admin/reports/report-model";
import { PageHeader } from "@/components/admin/page-header";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
import { reportService } from "@/server/reports";

export const metadata: Metadata = { title: "Reports" };

/**
 * The house's reports (Pattern: analytics): occupancy, arrivals and
 * departures, and cleans done, for this month unless other dates are
 * chosen (?from=&until=). No money: for the owner and sales
 * (reports:operations). The owner also gets the Money tab.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const actor = await requireDashboardActor({ permission: "reports:operations" });
  const reports = reportService();
  const context = await reports.dates(actor);
  const { range, corrected } = rangeQueryFrom(await searchParams, context);
  const { occupancy, movements, cleaning } = await reports.operations(actor, range);
  const canDownload = can(actor, "reports:operations");
  const presets = rangePresets(context).map((preset) => ({ label: preset.label, href: operationsHref(preset.range), current: sameRange(preset.range, range) }));

  return (
    <>
      <PageHeader title="Reports" description="How full the apartments were, who came and went, and the cleaning done." />
      <ReportTabs current="house" houseHref={operationsHref(range)} moneyHref={can(actor, "reports:revenue") ? revenueHref(range) : null} />
      <div className="grid max-w-admin gap-5">
        <RangeControls action={reportsPath} range={range} presets={presets} />
        {corrected && <Notice tone="warning">Some of the dates asked for couldn&apos;t be used, so this shows {rangeLabel(range)}.</Notice>}

        <RangeHeading
          title={rangeLabel(range)}
          summary={houseSummary({ occupancyRate: occupancy.total.rate, arrivals: movements.arrivals, departures: movements.departures, cleans: cleaning.cleans })}
        />

        <OccupancyPanel occupancy={occupancy} today={context.today} downloadHref={canDownload ? exportHref("occupancy", range) : null} />
        <MovementsPanel movements={movements} range={range} downloadHref={canDownload ? exportHref("arrivals-departures", range) : null} />
        <CleaningPanel cleaning={cleaning} range={range} downloadHref={canDownload ? exportHref("cleaning", range) : null} />
      </div>
    </>
  );
}
