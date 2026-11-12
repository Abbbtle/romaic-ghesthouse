import type { Metadata } from "next";
import { RangeControls, RangeHeading, ReportTabs } from "@/components/admin/reports/report-frame";
import {
  exportHref,
  moneySummary,
  operationsHref,
  rangeLabel,
  rangePresets,
  rangeQueryFrom,
  revenueHref,
  revenuePath,
  sameRange,
} from "@/components/admin/reports/report-model";
import { BalancesPanel, ChannelsPanel, RatesPanel } from "@/components/admin/reports/revenue-panels";
import { PageHeader } from "@/components/admin/page-header";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
import { reportService } from "@/server/reports";

export const metadata: Metadata = { title: "Money reports" };

/**
 * The money reports (Pattern: analytics): money from stays with the
 * average per night booked (ADR) and earned per night open (RevPAR), money
 * from stays and commission by channel, for this month unless other dates
 * are chosen; and what's still to pay, as of today. The owner's alone
 * (reports:revenue); downloads ask for finance:export and a recent
 * password and code.
 */
export default async function RevenueReportsPage({ searchParams }: PageProps<"/admin/reports/revenue">) {
  const actor = await requireDashboardActor({ permission: "reports:revenue" });
  const reports = reportService();
  const context = await reports.dates(actor);
  const { range, corrected } = rangeQueryFrom(await searchParams, context);
  const [{ revenue, channels }, { asOf, balances }] = await Promise.all([reports.revenue(actor, range), reports.balances(actor)]);
  const canDownload = can(actor, "finance:export");
  const presets = rangePresets(context).map((preset) => ({ label: preset.label, href: revenueHref(preset.range), current: sameRange(preset.range, range) }));

  return (
    <>
      <PageHeader title="Reports" description="What the stays earned, per night and by channel, and who still owes money." />
      <ReportTabs current="money" houseHref={operationsHref(range)} moneyHref={revenueHref(range)} />
      <div className="grid max-w-admin gap-5">
        <RangeControls action={revenuePath} range={range} presets={presets} />
        {corrected && <Notice tone="warning">Some of the dates asked for couldn&apos;t be used, so this shows {rangeLabel(range)}.</Notice>}

        <RangeHeading
          title={rangeLabel(range)}
          summary={moneySummary({ revenueCents: revenue.total.revenueCents, adrCents: revenue.total.adrCents, stillToPayCents: balances.totalCents })}
        />

        <RatesPanel revenue={revenue} range={range} today={context.today} downloadHref={canDownload ? exportHref("rates", range) : null} />
        <ChannelsPanel channels={channels} range={range} downloadHref={canDownload ? exportHref("channels", range) : null} />
        <BalancesPanel balances={balances} asOf={asOf} downloadHref={canDownload ? exportHref("still-to-pay", range) : null} />
      </div>
    </>
  );
}
