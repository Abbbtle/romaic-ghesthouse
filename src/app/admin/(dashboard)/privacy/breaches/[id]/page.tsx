import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { ChangeBreachForm } from "@/components/admin/privacy/breach-forms";
import { BreachStatusPill } from "@/components/admin/privacy/privacy-labels";
import { privacyPaths } from "@/components/admin/privacy/privacy-paths";
import { StatusPill } from "@/components/admin/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort } from "@/lib/format/date-time";
import { breachToDo } from "@/lib/privacy/privacy";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { changeBreach } from "../../actions";

export const metadata: Metadata = { title: "Breach" };

/**
 * One breach (Pattern: detail): what's still to do on it first, then its
 * record, kept up to date as it's handled. Owner only (privacy:requests).
 */
export default async function BreachPage({ params }: PageProps<"/admin/privacy/breaches/[id]">) {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { id } = await params;
  const privacy = privacyService();
  const breach = await privacy.breach(actor, id);
  if (!breach) notFound();
  const steps = breachToDo(breach);

  return (
    <>
      <PageHeader title={`Breach discovered ${formatDateShort(breach.discoveredOn)}`} description="What happened, who it affects, and what's been done about it." back={{ href: privacyPaths.breaches, label: "Breaches" }} />
      <div className="grid max-w-admin gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <BreachStatusPill status={breach.status} />
          {steps.map((step) => (
            <StatusPill key={step} tone="warning">
              {step}
            </StatusPill>
          ))}
        </div>
        {steps.length > 0 && (
          <p className="text-sm text-fg-2">
            See <TextLink href={privacyPaths.procedure}>what to do after a breach</TextLink> for each step, and what the Act says about telling the Regulator and the people affected.
          </p>
        )}
        <Panel title="The record" description="Update it as you go: when it's contained, when the Regulator and the people affected are told, and what's been done.">
          <ChangeBreachForm
            today={privacy.today()}
            action={changeBreach}
            breach={{
              id: breach.id,
              discoveredOn: breach.discoveredOn,
              summary: breach.summary,
              dataInvolved: breach.dataInvolved,
              peopleAffected: breach.peopleAffected === null ? "" : String(breach.peopleAffected),
              status: breach.status,
              containedOn: breach.containedOn ?? "",
              regulatorToldOn: breach.regulatorToldOn ?? "",
              regulatorReference: breach.regulatorReference ?? "",
              peopleToldOn: breach.peopleToldOn ?? "",
              peopleToldHow: breach.peopleToldHow ?? "",
              actions: breach.actions ?? "",
              revision: breach.revision,
            }}
          />
        </Panel>
      </div>
    </>
  );
}
