import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { NewBreachSheet } from "@/components/admin/privacy/breach-forms";
import { BreachStatusPill } from "@/components/admin/privacy/privacy-labels";
import { breachPath, privacyPaths } from "@/components/admin/privacy/privacy-paths";
import { PrivacyTabs } from "@/components/admin/privacy/privacy-tabs";
import { StatusPill } from "@/components/admin/status-pill";
import { Notice } from "@/components/ui/notice";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort } from "@/lib/format/date-time";
import { breachToDo } from "@/lib/privacy/privacy";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { recordBreach } from "../actions";

export const metadata: Metadata = { title: "Breach register" };

/**
 * The breach register (Pattern: list): each security compromise, newest
 * first, with what's still to do on it (contain it, tell the Regulator,
 * tell the people affected), and the procedure a tap away. Entries are kept
 * for good. Owner only (privacy:requests).
 */
export default async function BreachesPage() {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const privacy = privacyService();
  const breaches = await privacy.breaches(actor);

  return (
    <>
      <PageHeader
        title="Breaches"
        description="Each time personal information was seen, taken or lost by someone who shouldn't have it, and what was done about it."
        actions={<NewBreachSheet action={recordBreach} today={privacy.today()} primary />}
      />
      <PrivacyTabs current="breaches" />
      <div className="grid max-w-admin gap-6">
        <Notice tone="info" live="off" title="Something has happened?">
          Record it now with what you know, then follow <TextLink href={privacyPaths.procedure}>what to do after a breach</TextLink>, step by step.
        </Notice>

        {breaches.length > 0 ? (
          <Panel title="Register" description="Kept for good: an entry is updated as it's handled, never removed." flush>
            <List label="Breaches">
              {breaches.map((breach) => {
                const steps = breachToDo(breach);
                return (
                  <ListRow key={breach.id} href={breachPath(breach.id)} trailing={<BreachStatusPill status={breach.status} />}>
                    <span className="block font-medium text-ink">Discovered {formatDateShort(breach.discoveredOn)}</span>
                    <span className="line-clamp-2 block text-sm break-words text-fg-2">{breach.summary}</span>
                    {steps.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {steps.map((step) => (
                          <StatusPill key={step} tone="warning">
                            {step}
                          </StatusPill>
                        ))}
                      </span>
                    )}
                  </ListRow>
                );
              })}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No breaches recorded" icon={<ShieldCheck aria-hidden="true" />}>
            If guests&apos; information is ever seen, taken or lost by someone who shouldn&apos;t have it, a stolen laptop or a message sent to the wrong person, record it here.
          </EmptyState>
        )}
      </div>
    </>
  );
}
