import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { LegalPointText } from "@/components/admin/privacy/privacy-labels";
import { privacyPaths } from "@/components/admin/privacy/privacy-paths";
import { adminRoutes } from "@/components/admin/admin-routes";
import { ExternalLink } from "@/components/ui/external-link";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort } from "@/lib/format/date-time";
import { breachDuties, popiaAct, regulatorPopiaPage, regulatorPortalUrl } from "@/lib/privacy/sources";
import { requireDashboardActor } from "@/server/admin-session";

export const metadata: Metadata = { title: "What to do after a breach" };

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 px-4 py-4 lg:px-5">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-hairline font-bold text-ink tabular-nums">
        {number}
      </span>
      <div className="grid gap-2">
        <h3 className="font-bold text-ink">
          <span className="sr-only">Step {number}: </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

/**
 * The breach procedure in plain steps. Every duty or timeframe it states is
 * quoted closely from section 22 of the Act or the Information Regulator's
 * POPIA page, with the source and the day it was read
 * (src/lib/privacy/sources.ts); the rest is practical advice, worded as
 * such. Nothing here sends a notice: the owner does that on the
 * Regulator's portal and to the people affected. Owner only
 * (privacy:requests).
 */
export default async function BreachProcedurePage() {
  await requireDashboardActor({ permission: "privacy:requests" });
  return (
    <>
      <PageHeader title="What to do after a breach" description="When guests' personal information may have been seen, taken or lost by someone who shouldn't have it." back={{ href: privacyPaths.breaches, label: "Breaches" }} />
      <div className="grid max-w-admin gap-6">
        <p className="text-sm text-fg-2">
          A guide, not legal advice. Work through it with your Information Officer, and a legal adviser if you&apos;re unsure. Nothing on this page sends anything: you tell the Regulator and the people affected yourself.
        </p>

        <Panel title="Step by step" flush>
          <ol className="divide-y divide-hairline">
            <Step number={1} title="Stop it going further">
              <p className="text-sm text-fg-2">
                Change passwords, sign out of devices you don&apos;t recognise (under <TextLink href={adminRoutes.account}>Account</TextLink>), and turn off any account that shouldn&apos;t have access (under{" "}
                <TextLink href={adminRoutes.team}>Team</TextLink>). Ask Weberu for help with the website.
              </p>
            </Step>
            <Step number={2} title="Record it in the register now">
              <p className="text-sm text-fg-2">
                Add it under <TextLink href={privacyPaths.breaches}>Breaches</TextLink> with what you know: when you found it, what happened, what information and how many people. Fill in the rest as you learn more.
              </p>
            </Step>
            <Step number={3} title="Decide whether it must be reported">
              <LegalPointText point={breachDuties.whoToTell} />
            </Step>
            <Step number={4} title="Tell the Information Regulator">
              <LegalPointText point={breachDuties.when} />
              <LegalPointText point={breachDuties.portal} />
              <p className="text-sm text-fg-2">
                The portal: <ExternalLink href={regulatorPortalUrl}>eservices.inforegulator.org.za</ExternalLink>. Write the reference it gives you in the breach&apos;s record.
              </p>
            </Step>
            <Step number={5} title="Tell the people affected">
              <LegalPointText point={breachDuties.how} />
              <LegalPointText point={breachDuties.what} />
              <LegalPointText point={breachDuties.delay} />
            </Step>
            <Step number={6} title="Keep the record up to date">
              <p className="text-sm text-fg-2">Note when it was contained, the day you told the Regulator and the people affected and how, and everything you did. The register keeps every entry.</p>
            </Step>
            <Step number={7} title="Fix what let it happen">
              <p className="text-sm text-fg-2">Once it&apos;s over, change what allowed it, such as how paper records are stored or who has an account, and note it under what&apos;s been done.</p>
            </Step>
          </ol>
        </Panel>

        <Panel title="Sources">
          <ul className="grid gap-2 text-sm text-fg-2">
            <li>
              <ExternalLink href={popiaAct.url}>{popiaAct.title}</ExternalLink>, section 22. Checked {formatDateShort(popiaAct.checkedOn)}.
            </li>
            <li>
              <ExternalLink href={regulatorPopiaPage.url}>{regulatorPopiaPage.title}</ExternalLink>. Checked {formatDateShort(regulatorPopiaPage.checkedOn)}.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
