import { Upload } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lineViewFrom, type LineView } from "@/components/admin/bank/bank-labels";
import { bankAccountPath, bankPath } from "@/components/admin/bank/bank-paths";
import { LineList } from "@/components/admin/bank/line-list";
import { ReconciliationSummary } from "@/components/admin/bank/reconciliation-summary";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Tabs } from "@/components/admin/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { bankLimits, maskedNumber } from "@/lib/bookkeeping/bank";
import { formatDateShort } from "@/lib/format/date-time";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { requireDashboardActor } from "@/server/admin-session";
import { bankService } from "@/server/bookkeeping";
import { clock } from "@/server/infrastructure";

export const metadata: Metadata = { title: "Bank account" };

const count = (value: unknown): number | null => (typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : null);
const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/**
 * One bank account (Pattern: detail with a list): the statement's balance
 * against the books (and, once every line is matched, what in the books has
 * no line), its lines not matched yet (or matched, or all), and the
 * statements imported. Import a statement leads. The owner's alone
 * (bank:manage).
 */
export default async function BankAccountPage({ params, searchParams }: PageProps<"/admin/books/bank/[id]">) {
  const actor = await requireDashboardActor({ permission: "bank:manage" });
  const { id } = await params;
  const query = await searchParams;
  const view: LineView = lineViewFrom(query.lines);
  const detail = await bankService().account(actor, id, { status: view, limit: bankLimits.linesShown });
  if (!detail) notFound();
  const { account, imports, lines, notOnStatement } = detail;
  const today = zonedToday(clock.now(), businessTimeZone);
  const path = bankAccountPath(account.id);
  const imported = count(query.imported);
  const duplicates = count(query.duplicates) ?? 0;
  const skipped = count(query.skipped) ?? 0;
  const tabs = [
    { href: path, label: "Not matched yet", count: account.reconciliation.toReconcile },
    { href: `${path}?lines=matched`, label: "Matched" },
    { href: `${path}?lines=all`, label: "All", count: account.reconciliation.lineCount },
  ];
  const current = view === "unmatched" ? path : `${path}?lines=${view}`;

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.bankName} ${maskedNumber(account.accountNumberLast4)} · account ${account.ledgerCode} in the books`}
        back={{ href: bankPath, label: "Bank" }}
        actions={
          <ButtonLink href={`${path}/import`} size="sm" icon={<Upload aria-hidden="true" strokeWidth={2} className="size-4" />}>
            Import a statement
          </ButtonLink>
        }
      />
      <div className="grid max-w-admin gap-5">
        {query.notice === "added" && <Notice tone="success">Bank account added. Import its statement from your online banking to start reconciling.</Notice>}
        {imported !== null && (
          <Notice tone="success" title={`Imported ${plural(imported, "new line", "new lines")}`}>
            {[duplicates > 0 && `${plural(duplicates, "line was", "lines were")} already here and left alone.`, skipped > 0 && `${plural(skipped, "row", "rows")} couldn't be read and ${skipped === 1 ? "was" : "were"} left out.`]
              .filter(Boolean)
              .join(" ") || "Match each one with the books below."}
          </Notice>
        )}

        <ReconciliationSummary reconciliation={account.reconciliation} notOnStatement={notOnStatement} ledgerCode={account.ledgerCode} today={today} />

        {account.reconciliation.lineCount > 0 ? (
          <>
            <Tabs label="Statement lines" items={tabs} current={current} />
            {lines.length > 0 ? (
              <Panel flush>
                <LineList lines={lines} today={today} />
                {lines.length === bankLimits.linesShown && <p className="border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">These are the latest {bankLimits.linesShown}.</p>}
              </Panel>
            ) : (
              <EmptyState title={view === "unmatched" ? "Every line is matched" : "No lines here"}>
                {view === "unmatched" ? "Import the next statement when it's out." : "Lines show here once they're matched."}
              </EmptyState>
            )}
          </>
        ) : (
          <EmptyState title="No statement yet">Export a statement from your online banking as a CSV file and import it. You&rsquo;ll say which column holds what the first time.</EmptyState>
        )}

        {imports.length > 0 && (
          <Panel title="Statements imported" description="The latest five." flush>
            <ul className="divide-y divide-hairline">
              {imports.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm lg:px-5">
                  <span className="min-w-0 font-medium break-words text-ink">{entry.fileName}</span>
                  <span className="text-fg-2">
                    {formatDateShort(zonedToday(entry.importedAt, businessTimeZone))} · {plural(entry.addedCount, "new line", "new lines")}
                    {entry.duplicateCount > 0 && `, ${entry.duplicateCount} already here`}
                    {entry.skippedCount > 0 && `, ${entry.skippedCount} left out`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
