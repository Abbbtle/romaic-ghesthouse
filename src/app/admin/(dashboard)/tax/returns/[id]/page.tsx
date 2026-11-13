import type { Metadata } from "next";
import { Download, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill, type StatusTone } from "@/components/admin/status-pill";
import { ReturnDisclaimer, ReturnFigures, type FigureRow } from "@/components/admin/tax/return-figures";
import { FileReturnForm, ReturnSteps } from "@/components/admin/tax/return-forms";
import { taxPaths, taxReturnPath } from "@/components/admin/tax/tax-paths";
import { ButtonLink } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort } from "@/lib/format/date-time";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { isLate, lateText } from "@/lib/tax/deadlines";
import { describeValue, parameterCatalogue } from "@/lib/tax/parameters";
import { publicHolidayCaveat } from "@/lib/tax/periods";
import { figureText, returnKindNames, returnStatusNames, type ReturnStatus } from "@/lib/tax/returns";
import { requireDashboardActor } from "@/server/admin-session";
import { taxService } from "@/server/tax";
import { discardReturn, fileReturn, refreshReturn, reopenReturn, reviewReturn } from "../../actions";

export const metadata: Metadata = { title: "Tax return" };

const statusTones: Record<ReturnStatus, StatusTone> = { draft: "warning", reviewed: "info", filed: "success" };

const dayOf = (instant: Date) => formatDateShort(zonedToday(instant, businessTimeZone));

/**
 * One return (Pattern: detail): its figures from the books, the rates and
 * dates they used with their sars.gov.za pages, where it stands, and its
 * next step: mark a draft reviewed, record a reviewed one as filed with the
 * proof. Export and print for the accountant. Owner only (tax:manage).
 */
export default async function TaxReturnPage({ params }: PageProps<"/admin/tax/returns/[id]">) {
  const actor = await requireDashboardActor({ permission: "tax:manage" });
  const { id } = await params;
  const service = taxService();
  const taxReturn = await service.taxReturn(actor, id);
  if (!taxReturn) notFound();
  const rows: FigureRow[] = taxReturn.figures.lines.map((line) => ({ key: line.key, label: line.label, value: figureText(line), strong: Boolean(line.strong) }));
  const today = service.today();
  const late = isLate(taxReturn.dueOn, taxReturn.status, today);
  const exportHref = `${taxReturnPath(taxReturn.id)}/export`;
  const printHref = `${taxReturnPath(taxReturn.id)}/print`;

  return (
    <>
      <PageHeader
        title={taxReturn.label}
        description={`${returnKindNames[taxReturn.kind]} for ${formatDateShort(taxReturn.periodStart)} to ${formatDateShort(taxReturn.periodEnd)}.`}
        back={{ href: taxPaths.returns, label: "Returns" }}
      />
      <div className="grid max-w-admin gap-6">
        <ReturnDisclaimer />

        <section aria-labelledby="return-state" className="grid gap-3">
          <h2 id="return-state" className="sr-only">
            Where it stands
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
            <StatusPill tone={statusTones[taxReturn.status]}>{returnStatusNames[taxReturn.status]}</StatusPill>
            {taxReturn.dueOn && (late ? <StatusPill tone="danger">{lateText(taxReturn.dueOn, today)}</StatusPill> : <span>Due {formatDateShort(taxReturn.dueOn)}</span>)}
            <span>Prepared {dayOf(taxReturn.preparedAt)}</span>
            {taxReturn.reviewedAt && <span>Reviewed {dayOf(taxReturn.reviewedAt)}</span>}
            {taxReturn.filedOn && <span>Filed {formatDateShort(taxReturn.filedOn)}</span>}
            {taxReturn.submissionReference && <span>SARS reference {taxReturn.submissionReference}</span>}
          </p>
          {taxReturn.dueOn && taxReturn.status !== "filed" && !late && <p className="text-sm text-fg-3">{publicHolidayCaveat}</p>}
          <ReturnSteps id={taxReturn.id} status={taxReturn.status} actions={{ review: reviewReturn, reopen: reopenReturn, refresh: refreshReturn, discard: discardReturn }} backHref={taxPaths.returns} />
        </section>

        <Panel title="Figures" description="From the books for the period, for you or your accountant to check against eFiling." flush>
          <ReturnFigures rows={rows} warnings={taxReturn.figures.warnings} notes={taxReturn.figures.notes} />
        </Panel>

        {taxReturn.status === "reviewed" && (
          <Panel title="Record as filed" description="Once it's filed on eFiling, record the day and upload the proof of submission.">
            <FileReturnForm id={taxReturn.id} today={today} locksMonths={taxReturn.kind !== "irp6"} action={fileReturn} />
          </Panel>
        )}

        {taxReturn.status === "filed" && taxReturn.proofFileId && (
          <Panel title="Proof of submission">
            <TextLink href={`/admin/files/${taxReturn.proofFileId}`} prefetch={false}>
              Download the proof of submission
            </TextLink>
          </Panel>
        )}

        <Panel title="Rates and dates used" description="The versions these figures were worked out with, as they were when it was prepared." flush>
          {taxReturn.parameters.length > 0 ? (
            <ul className="divide-y divide-hairline text-sm">
              {taxReturn.parameters.map((parameter) => (
                <li key={`${parameter.code}-${parameter.version}`} className="grid gap-0.5 px-4 py-3 lg:px-5">
                  <p className="text-ink">
                    <span className="font-medium">{parameterCatalogue[parameter.code]?.name ?? parameter.code}</span>: {describeValue(parameter.code, parameter.value)}
                  </p>
                  <p className="text-fg-2">
                    Version {parameter.version}, checked {formatDateShort(parameter.checkedOn)} on <ExternalLink href={parameter.sourceUrl}>sars.gov.za</ExternalLink>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">None.</p>
          )}
        </Panel>

        <Panel title="For your accountant" description="The figures, the rates and dates used, and every journal behind them.">
          <div className="flex flex-wrap gap-3">
            <ButtonLink variant="secondary" href={exportHref} prefetch={false} icon={<Download aria-hidden="true" />}>
              Download CSV
            </ButtonLink>
            <ButtonLink variant="secondary" href={printHref} icon={<Printer aria-hidden="true" />}>
              Print view
            </ButtonLink>
          </div>
        </Panel>
      </div>
    </>
  );
}
