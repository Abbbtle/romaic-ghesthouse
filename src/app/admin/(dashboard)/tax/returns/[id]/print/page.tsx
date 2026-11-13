import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/money/print-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintableReturn, ReturnFact } from "@/components/admin/tax/printable-return";
import { taxReturnPath } from "@/components/admin/tax/tax-paths";
import { formatDateShort } from "@/lib/format/date-time";
import { describeValue, parameterCatalogue } from "@/lib/tax/parameters";
import { figureText, returnKindNames, returnStatusNames } from "@/lib/tax/returns";
import { can } from "@/lib/accounts/access";
import { requireDashboardActor } from "@/server/admin-session";
import { getSiteContent } from "@/server/site-content";
import { taxService } from "@/server/tax";

export const metadata: Metadata = { title: "Print tax return" };

/**
 * A return as a page to print or save as a PDF for the accountant: its
 * facts, figures, checks, and the rates and dates used, with the disclaimer.
 * Owner only (tax:manage).
 */
export default async function PrintTaxReturnPage({ params }: PageProps<"/admin/tax/returns/[id]/print">) {
  // A print view is an export: it asks for a recent step-up (roles.md).
  const actor = await requireDashboardActor({ permission: "finance:export", stepUp: true });
  if (!can(actor, "tax:manage")) notFound();
  const { id } = await params;
  const pack = await taxService().printPack(actor, id);
  if (!pack) notFound();
  const [content, requestHeaders] = await Promise.all([getSiteContent(), headers()]);
  const { taxReturn, journalCount } = pack;

  return (
    <>
      <PageHeader title="Print" back={{ href: taxReturnPath(taxReturn.id), label: taxReturn.label }} actions={<PrintButton />} />
      <div className="grid max-w-admin gap-6">
        <PrintableReturn
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          businessName={content.site.businessName}
          title={taxReturn.label}
          facts={
            <>
              <ReturnFact label="Return">{returnKindNames[taxReturn.kind]}</ReturnFact>
              <ReturnFact label="Period">
                {formatDateShort(taxReturn.periodStart)} to {formatDateShort(taxReturn.periodEnd)}
              </ReturnFact>
              <ReturnFact label="Status">
                {returnStatusNames[taxReturn.status]}
                {taxReturn.filedOn ? `, filed ${formatDateShort(taxReturn.filedOn)}` : ""}
                {taxReturn.submissionReference ? ` (SARS reference ${taxReturn.submissionReference})` : ""}
              </ReturnFact>
              <ReturnFact label="Due">{taxReturn.dueOn ? formatDateShort(taxReturn.dueOn) : "See your accountant"}</ReturnFact>
            </>
          }
          rows={taxReturn.figures.lines.map((line) => ({ key: line.key, label: line.label, value: figureText(line), strong: Boolean(line.strong) }))}
          warnings={taxReturn.figures.warnings}
          notes={taxReturn.figures.notes}
          parameters={taxReturn.parameters.map((parameter) => ({
            key: `${parameter.code}-${parameter.version}`,
            name: parameterCatalogue[parameter.code]?.name ?? parameter.code,
            value: describeValue(parameter.code, parameter.value),
            source: parameter.sourceUrl,
            checked: formatDateShort(parameter.checkedOn),
          }))}
          journalCount={journalCount}
        />
      </div>
    </>
  );
}
