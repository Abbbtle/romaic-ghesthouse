import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill, type StatusTone } from "@/components/admin/status-pill";
import { ReturnDisclaimer } from "@/components/admin/tax/return-figures";
import { taxPaths, taxReturnPath } from "@/components/admin/tax/tax-paths";
import { TaxTabs } from "@/components/admin/tax/tax-tabs";
import { ButtonLink } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import type { VatWatch } from "@/lib/tax/calendar";
import { byDeadline, dueDayText, lateText } from "@/lib/tax/deadlines";
import { parameterCatalogue } from "@/lib/tax/parameters";
import { publicHolidayCaveat } from "@/lib/tax/periods";
import { maskedReference, registrationKinds, registrationNames, type Registration } from "@/lib/tax/registrations";
import { returnStatusNames, whatItBlocks, type ReturnStatus } from "@/lib/tax/returns";
import { requireDashboardActor } from "@/server/admin-session";
import { taxService } from "@/server/tax";

export const metadata: Metadata = { title: "Tax" };

const statusTones: Record<ReturnStatus, StatusTone> = { draft: "warning", reviewed: "info", filed: "success" };

/** A calendar item's status as its pill: the return's status once prepared, otherwise "Not prepared". */
function ItemStatus({ status }: { status: ReturnStatus | null }) {
  return status ? <StatusPill tone={statusTones[status]}>{returnStatusNames[status]}</StatusPill> : <StatusPill>Not prepared</StatusPill>;
}

const watchWords: Record<VatWatch["level"], { label: string; tone: StatusTone }> = {
  clear: { label: "Below the threshold", tone: "success" },
  near: { label: "Near the threshold", tone: "warning" },
  over: { label: "Over the threshold", tone: "danger" },
  unknown: { label: "Can't check", tone: "neutral" },
};

function registrationLine(registration: Registration | null): string {
  if (!registration) return "Not set";
  if (!registration.registered) return `Not registered from ${formatDateShort(registration.effectiveFrom ?? "")}`;
  const reference = maskedReference(registration.referenceLast4);
  return [`Registered from ${formatDateShort(registration.effectiveFrom ?? "")}`, registration.details.vatCategory ? `category ${registration.details.vatCategory}` : null, reference].filter(Boolean).join(" · ");
}

/**
 * Tax at a glance (Pattern: dashboard): any rate or date that isn't
 * verified and the returns it holds up, returns that are late, what's due
 * soon from the registrations and verified rates and dates, the VAT
 * registration watch until the business is registered, and anything that
 * stops a date being shown. Owner only (tax:manage); never admin, sales or
 * staff.
 */
export default async function TaxOverviewPage() {
  const actor = await requireDashboardActor({ permission: "tax:manage" });
  const { today, registrations, calendar, vatWatch, unverified } = await taxService().overview(actor);
  const { late, comingUp } = byDeadline(calendar.items, today);
  const itemHref = (returnId: string | null) => (returnId ? taxReturnPath(returnId) : taxPaths.returns);
  const itemKey = (item: (typeof calendar.items)[number]) => `${item.kind}-${item.periodStart}-${item.periodEnd}`;

  return (
    <>
      <PageHeader
        title="Tax"
        description="Returns prepared from the books for you or your accountant to check and file on eFiling, the dates they're due, and payroll."
        actions={
          <ButtonLink variant="primary" href={taxPaths.returns}>
            Prepare a return
          </ButtonLink>
        }
      />
      <TaxTabs current="overview" />
      <div className="grid max-w-admin gap-6">
        {unverified.length > 0 && (
          <Notice tone="warning" live="off" title={unverified.length === 1 ? "One rate or date isn't verified on sars.gov.za" : `${unverified.length} rates and dates aren't verified on sars.gov.za`}>
            <ul className="grid gap-1">
              {unverified.map((code) => (
                <li key={code}>
                  <span className="font-bold">{parameterCatalogue[code].name}.</span> {whatItBlocks(code)}
                </li>
              ))}
            </ul>
            <p className="mt-1">
              <TextLink href={taxPaths.parameters}>See rates and dates</TextLink>
            </p>
          </Notice>
        )}

        <ReturnDisclaimer />

        {late.length > 0 && (
          <Panel title="Late" description="Past the due date and not recorded as filed here. If one is filed on eFiling already, record it with the proof." flush>
            <List label="Late returns">
              {late.map((item) => (
                <ListRow key={itemKey(item)} href={itemHref(item.returnId)} trailing={<ItemStatus status={item.status} />}>
                  <span className="block font-medium text-ink">{item.label}</span>
                  <StatusPill tone="danger" className="mt-1">
                    {lateText(item.dueOn, today)}
                  </StatusPill>
                </ListRow>
              ))}
            </List>
          </Panel>
        )}

        <Panel title="Coming up" description={`Due dates from your registrations and the verified rates and dates. ${publicHolidayCaveat}`} flush>
          {comingUp.length > 0 ? (
            <List label="Returns due">
              {comingUp.map((item) => (
                <ListRow key={itemKey(item)} href={itemHref(item.returnId)} trailing={<ItemStatus status={item.status} />}>
                  <span className="block font-medium text-ink">{item.label}</span>
                  <span className="block text-sm text-fg-2">
                    Due <span className="font-medium text-ink tabular-nums">{dueDayText(item.dueOn, today)}</span>
                    {item.manualDueOn && ` · by ${dueDayText(item.manualDueOn, today)} if not on eFiling`}
                  </span>
                </ListRow>
              ))}
            </List>
          ) : calendar.items.length > 0 ? (
            <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">Nothing else is due in the next four months.</p>
          ) : (
            <EmptyState title="Nothing due yet" icon={<CalendarClock aria-hidden="true" />} frame="none" className="p-4 lg:p-5">
              Due dates appear here once you record the business&apos;s registrations: VAT, PAYE, income tax or turnover tax.
            </EmptyState>
          )}
        </Panel>

        {calendar.gaps.length > 0 && (
          <Notice tone="warning" live="off" title="Some dates can't be shown">
            <ul className="grid list-disc gap-1 pl-5">
              {calendar.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </Notice>
        )}

        {vatWatch && (
          <Panel
            title="VAT registration watch"
            description="The business is treated as not registered for VAT until you record a registration. Registering becomes compulsory once taxable supplies pass the threshold in any 12 months."
            actions={<StatusPill tone={watchWords[vatWatch.level].tone}>{watchWords[vatWatch.level].label}</StatusPill>}
            flush
          >
            <dl className="divide-y divide-hairline">
              <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
                <dt className="text-fg-2">
                  Income in the books, {formatDateShort(vatWatch.from)} to {formatDateShort(vatWatch.until)}
                </dt>
                <dd className="shrink-0 text-right tabular-nums text-ink" data-numeric>
                  {formatCents(vatWatch.suppliesCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
                <dt className="min-w-0">
                  <span className="block font-bold text-ink">Compulsory registration threshold</span>
                  {vatWatch.threshold.status === "verified" && (
                    <span className="block text-sm text-fg-2">
                      Checked {formatDateShort(vatWatch.threshold.parameter.checkedOn)} on <ExternalLink href={vatWatch.threshold.parameter.sourceUrl}>sars.gov.za</ExternalLink>
                    </span>
                  )}
                </dt>
                <dd className="shrink-0 text-right font-bold tabular-nums text-ink" data-numeric>
                  {vatWatch.threshold.status === "verified" ? formatCents(vatWatch.threshold.cents) : "Not verified"}
                </dd>
              </div>
            </dl>
            <div className="grid gap-2 border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">
              {vatWatch.threshold.status === "verified" ? (
                <>
                  {vatWatch.level === "near" && (
                    <p>
                      &ldquo;Near&rdquo; means {Math.round(vatWatch.nearShare * 100)}% of the threshold or more: the app&apos;s own early warning, not a SARS figure.
                    </p>
                  )}
                  <p>All income in the books counts as taxable supplies here; your accountant confirms what does.</p>
                </>
              ) : (
                <p>
                  The threshold isn&apos;t verified on sars.gov.za, so the watch can&apos;t run until a checked version is added. <TextLink href={taxPaths.parameters}>See rates and dates</TextLink>
                </p>
              )}
            </div>
          </Panel>
        )}

        <Panel title="Registrations" description="What each tax switches on here. Nothing is registered until you record it." actions={<TextLink href={taxPaths.registrations}>Change</TextLink>} flush>
          <List label="Registrations">
            {registrationKinds.map((kind) => (
              <ListRow key={kind} trailing={registrations[kind]?.registered ? <StatusPill tone="success">Registered</StatusPill> : <StatusPill>Not set</StatusPill>}>
                <span className="block font-medium text-ink">{registrationNames[kind]}</span>
                <span className="block text-sm text-fg-2">{registrationLine(registrations[kind])}</span>
              </ListRow>
            ))}
          </List>
        </Panel>
      </div>
    </>
  );
}
