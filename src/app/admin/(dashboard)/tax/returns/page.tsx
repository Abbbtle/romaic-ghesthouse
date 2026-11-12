import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill, type StatusTone } from "@/components/admin/status-pill";
import { ReturnDisclaimer } from "@/components/admin/tax/return-figures";
import { PrepareReturnForm, type PrepareOption } from "@/components/admin/tax/return-forms";
import { taxReturnPath } from "@/components/admin/tax/tax-paths";
import { TaxTabs } from "@/components/admin/tax/tax-tabs";
import { formatDateShort, formatMonth } from "@/lib/format/date-time";
import { isLate, lateText } from "@/lib/tax/deadlines";
import { returnKindNames, returnStatusNames, type ReturnStatus } from "@/lib/tax/returns";
import { requireDashboardActor } from "@/server/admin-session";
import { taxService } from "@/server/tax";
import { prepareReturn } from "../actions";

export const metadata: Metadata = { title: "Tax returns" };

const statusTones: Record<ReturnStatus, StatusTone> = { draft: "warning", reviewed: "info", filed: "success" };

/**
 * Returns (Pattern: list): prepare one from the books for a period the
 * registrations switch on, and every return prepared so far with its
 * status. Owner only (tax:manage).
 */
export default async function TaxReturnsPage() {
  const actor = await requireDashboardActor({ permission: "tax:manage" });
  const [choices, returns] = await Promise.all([taxService().prepareChoices(actor), taxService().returns(actor)]);
  const today = taxService().today();
  const options: PrepareOption[] = choices.map((choice) =>
    choice.available
      ? {
          kind: choice.kind,
          name: returnKindNames[choice.kind],
          available: true,
          reason: null,
          payments: choice.payments,
          periods: choice.periods.map((period) => ({ month: period.month, label: choice.kind === "emp201" ? formatMonth(period.month) : period.label.replace(/\d{4}-\d{2}-\d{2}/, (date) => formatDateShort(date)) })),
        }
      : { kind: choice.kind, name: returnKindNames[choice.kind], available: false, reason: choice.reason, payments: false, periods: [] },
  );
  const canPrepare = options.some((option) => option.available && option.periods.length > 0);

  return (
    <>
      <PageHeader title="Returns" description="Prepare a return from the books, check it with your accountant, file it on eFiling, then record it here with the proof." />
      <TaxTabs current="returns" />
      <div className="grid max-w-admin gap-6">
        <ReturnDisclaimer />
        <Panel title="Prepare a return" description="Its figures come from the books as they are now. A draft can be refreshed until it's marked reviewed.">
          {canPrepare ? (
            <PrepareReturnForm options={options} action={prepareReturn} />
          ) : (
            <p className="text-base text-fg-2">No return can be prepared yet.</p>
          )}
          {options.some((option) => !option.available || option.periods.length === 0) && (
            <ul className="mt-5 grid gap-2 border-t border-hairline pt-4 text-sm text-fg-2">
              {options
                .filter((option) => !option.available || option.periods.length === 0)
                .map((option) => (
                  <li key={option.kind}>
                    <span className="font-medium text-ink">{option.name}:</span> {option.reason ?? "no period has ended since the registration took effect."}
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <Panel title="Prepared returns" flush>
          {returns.length > 0 ? (
            <List label="Prepared returns">
              {returns.map((item) => (
                <ListRow key={item.id} href={taxReturnPath(item.id)} trailing={<StatusPill tone={statusTones[item.status]}>{returnStatusNames[item.status]}</StatusPill>}>
                  <span className="block font-medium text-ink">{item.label}</span>
                  {item.dueOn && isLate(item.dueOn, item.status, today) ? (
                    <StatusPill tone="danger" className="mt-1">
                      {lateText(item.dueOn, today)}
                    </StatusPill>
                  ) : (
                    <span className="block text-sm text-fg-2">
                      {item.status === "filed" && item.filedOn ? `Filed ${formatDateShort(item.filedOn)}` : item.dueOn ? `Due ${formatDateShort(item.dueOn)}` : `${formatDateShort(item.periodStart)} to ${formatDateShort(item.periodEnd)}`}
                    </span>
                  )}
                </ListRow>
              ))}
            </List>
          ) : (
            <EmptyState title="No returns yet" icon={<FileText aria-hidden="true" />} frame="none" className="p-4 lg:p-5">
              Returns you prepare are listed here, with their status, until they&apos;re filed and after.
            </EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
