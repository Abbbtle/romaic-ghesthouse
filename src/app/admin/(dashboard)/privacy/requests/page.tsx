import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { dueText, LegalPointText, RequestStatusPill } from "@/components/admin/privacy/privacy-labels";
import { privacyRequestPath } from "@/components/admin/privacy/privacy-paths";
import { PrivacyTabs } from "@/components/admin/privacy/privacy-tabs";
import { NewRequestSheet } from "@/components/admin/privacy/request-forms";
import { StatusPill } from "@/components/admin/status-pill";
import { formatDateShort } from "@/lib/format/date-time";
import { requestKindNames } from "@/lib/privacy/privacy";
import { requestTimeframes } from "@/lib/privacy/sources";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { logRequest } from "../actions";

export const metadata: Metadata = { title: "Information requests" };

/**
 * The data-subject request log (Pattern: list): open requests first, late
 * ones at the top, each with when it's due; closed ones after. Logging one
 * opens it. Owner only (privacy:requests).
 */
export default async function PrivacyRequestsPage() {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const privacy = privacyService();
  const requests = await privacy.requests(actor);
  const today = privacy.today();

  return (
    <>
      <PageHeader
        title="Information requests"
        description="People asking to see, correct or delete their personal information, or objecting to how it's used, and when each is due."
        actions={<NewRequestSheet action={logRequest} today={today} />}
      />
      <PrivacyTabs current="requests" />
      <div className="grid max-w-admin gap-6">
        {requests.length > 0 ? (
          <Panel title="Request log" description="Kept for good: a request can be closed, never removed." flush>
            <List label="Information requests">
              {requests.map((request) => {
                const due = dueText(request, today);
                return (
                  <ListRow key={request.id} href={privacyRequestPath(request.id)} trailing={<RequestStatusPill status={request.status} />}>
                    <span className="block font-medium break-words text-ink">{request.requesterName}</span>
                    <span className="block text-sm text-fg-2">
                      {requestKindNames[request.kind]} · received {formatDateShort(request.receivedOn)}
                    </span>
                    <StatusPill tone={due.tone} className="mt-1">
                      {due.text}
                    </StatusPill>
                  </ListRow>
                );
              })}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No information requests yet" icon={<Inbox aria-hidden="true" />}>
            When someone asks to see, correct or delete what you hold about them, by email, phone or in person, log it here with the day you&apos;ll answer by.
          </EmptyState>
        )}

        <Panel title="What the Act says about answering" headingLevel={2}>
          <div className="grid gap-2">
            {requestTimeframes.map((point) => (
              <LegalPointText key={point.section} point={point} />
            ))}
            <p className="text-sm text-fg-2">Check who is asking before you release anything about them, and agree each answer date with your Information Officer.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
