import type { Metadata } from "next";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Fact, Facts } from "@/components/admin/privacy/facts";
import { OfficerSheet } from "@/components/admin/privacy/officer-sheet";
import { dueText, LegalPointText, officerOnNoticeText } from "@/components/admin/privacy/privacy-labels";
import { privacyPaths, privacyRequestPath } from "@/components/admin/privacy/privacy-paths";
import { PrivacyTabs } from "@/components/admin/privacy/privacy-tabs";
import { StatusPill } from "@/components/admin/status-pill";
import { ExternalLink } from "@/components/ui/external-link";
import { TextLink } from "@/components/ui/text-link";
import { formatDateShort, formatTime } from "@/lib/format/date-time";
import { formatPhoneNumber } from "@/lib/format/phone";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { requestKindNames } from "@/lib/privacy/privacy";
import { officerRegistration, regulatorPortalUrl } from "@/lib/privacy/sources";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { saveOfficer } from "./actions";

export const metadata: Metadata = { title: "Privacy" };

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/**
 * Privacy at a glance (Pattern: dashboard): the Information Officer, the
 * requests waiting for an answer, breaches with steps still to take, and how
 * far the retention schedule is confirmed. Owner only (privacy:requests);
 * never admin, sales or staff.
 */
export default async function PrivacyOverviewPage() {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { today, officer, requests, breaches, retention } = await privacyService().overview(actor);
  const lastRun = retention.lastRun;

  return (
    <>
      <PageHeader
        title="Privacy"
        description="Guests' personal information under POPIA: requests from people about their information, breaches, how long records are kept, and your Information Officer."
      />
      <PrivacyTabs current="overview" />
      <div className="grid max-w-admin gap-6">
        <p className="text-sm text-fg-2">This helps you keep track of personal information and requests about it. It isn&apos;t legal advice: check what you decide with your Information Officer, or a legal adviser.</p>

        <Panel
          title="Information Officer"
          description="Who answers for personal information at the guesthouse and deals with people's requests."
          actions={<OfficerSheet officer={officer ? { name: officer.name, email: officer.email, phone: officer.phone ? formatPhoneNumber(officer.phone) : "", registrationReference: officer.registrationReference ?? "" } : null} action={saveOfficer} primary={!officer} />}
          flush
        >
          {officer ? (
            <Facts>
              <Fact label="Name">{officer.name}</Fact>
              <Fact label="Email">{officer.email}</Fact>
              <Fact label="Phone">{officer.phone ? formatPhoneNumber(officer.phone) : "Not given"}</Fact>
              <Fact label="Regulator registration">{officer.registrationReference ?? "Not recorded"}</Fact>
            </Facts>
          ) : (
            <p data-placeholder="unknown" className="px-4 py-3 text-base text-fg-3 italic lg:px-5">
              Not set yet. Add who answers for personal information and how people reach them.
            </p>
          )}
          <p className="border-t border-hairline px-4 py-3 text-sm text-fg-2 lg:px-5">{officerOnNoticeText(officer)}</p>
          <div className="grid gap-2 border-t border-hairline px-4 py-3 lg:px-5">
            {officerRegistration.map((point) => (
              <LegalPointText key={point.section} point={point} />
            ))}
            <p className="text-sm text-fg-2">
              Register your Information Officer on the Regulator&apos;s <ExternalLink href={regulatorPortalUrl}>eServices portal</ExternalLink>.
            </p>
          </div>
        </Panel>

        <Panel
          title="Information requests"
          description={requests.open === 0 ? "No request is waiting for an answer." : `${count(requests.open, "request is", "requests are")} waiting for an answer.`}
          actions={<TextLink href={privacyPaths.requests}>All information requests</TextLink>}
          flush
        >
          {requests.next.length > 0 ? (
            <List label="Information requests waiting for an answer">
              {requests.next.map((request) => {
                const due = dueText(request, today);
                return (
                  <ListRow key={request.id} href={privacyRequestPath(request.id)}>
                    <span className="block font-medium text-ink">
                      {request.requesterName} · {requestKindNames[request.kind]}
                    </span>
                    <StatusPill tone={due.tone} className="mt-1">
                      {due.text}
                    </StatusPill>
                  </ListRow>
                );
              })}
            </List>
          ) : (
            <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">When someone asks to see, correct or delete their information, log it under Information requests so its date isn&apos;t missed.</p>
          )}
        </Panel>

        <Panel
          title="Breaches"
          description={
            breaches.total === 0
              ? "None recorded."
              : `${count(breaches.total, "breach", "breaches")} recorded; ${breaches.withSteps === 0 ? "nothing left to do on any" : `${count(breaches.withSteps, "has", "have")} steps still to take`}.`
          }
          actions={<TextLink href={privacyPaths.breaches}>Breach register</TextLink>}
        >
          <p className="text-sm text-fg-2">
            If guests&apos; information is seen, taken or lost by someone who shouldn&apos;t have it, follow <TextLink href={privacyPaths.procedure}>what to do after a breach</TextLink>.
          </p>
        </Panel>

        <Panel
          title="Keeping records"
          description={`${retention.confirmed} of ${retention.total} rules confirmed. Nothing is anonymised or deleted until you confirm its rule.`}
          actions={<TextLink href={privacyPaths.retention}>The schedule</TextLink>}
        >
          <p className="text-sm text-fg-2">
            {lastRun
              ? `Last daily run ${formatDateShort(zonedToday(lastRun.ranAt, businessTimeZone))} at ${formatTime(lastRun.ranAt, businessTimeZone)}: ${count(lastRun.guestsAnonymised, "guest record", "guest records")} anonymised, ${count(lastRun.photosDeleted, "task photo", "task photos")} deleted.`
              : "The daily job hasn't run the schedule yet."}
          </p>
        </Panel>
      </div>
    </>
  );
}
