import { Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Fact, Facts } from "@/components/admin/privacy/facts";
import { LinkGuestButton, UnlinkGuestButton } from "@/components/admin/privacy/guest-actions";
import { dueText, LegalPointText, RequestStatusPill } from "@/components/admin/privacy/privacy-labels";
import { privacyGuestExportPath, privacyGuestPath, privacyPaths, privacyRequestPath } from "@/components/admin/privacy/privacy-paths";
import { ChangeRequestForm, IdentityForm, RequestSteps, RevealContact } from "@/components/admin/privacy/request-forms";
import { StatusPill } from "@/components/admin/status-pill";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/form-controls";
import { formatDateShort } from "@/lib/format/date-time";
import { formatPhoneNumber } from "@/lib/format/phone";
import { isOpen, requestKindNames } from "@/lib/privacy/privacy";
import { requestTimeframes } from "@/lib/privacy/sources";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { answerRequest, changeRequest, confirmIdentity, linkGuest, refuseRequest, revealContact, startRequest, unlinkGuest } from "../../actions";

export const metadata: Metadata = { title: "Information request" };

/**
 * One request (Pattern: detail): what happens next first (start, answer,
 * refuse), then who asked and what for, the guest record it's about (found
 * through the guest search, then exported or anonymised from the guest's
 * page), and its details and notes last. Owner only (privacy:requests).
 */
export default async function PrivacyRequestPage({ params, searchParams }: PageProps<"/admin/privacy/requests/[id]">) {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { id } = await params;
  const { q } = await searchParams;
  const privacy = privacyService();
  const found = await privacy.request(actor, id);
  if (!found) notFound();
  const { request, guest } = found;
  const today = privacy.today();
  const open = isOpen(request.status);
  const query = typeof q === "string" ? q.trim() : "";
  const matches = !guest && query ? await privacy.searchGuests(actor, query) : [];
  const due = dueText(request, today);

  return (
    <>
      <PageHeader
        title={request.requesterName}
        description={`${requestKindNames[request.kind]} request, received ${formatDateShort(request.receivedOn)}`}
        back={{ href: privacyPaths.requests, label: "Information requests" }}
      />
      <div className="grid max-w-admin gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusPill status={request.status} />
          <StatusPill tone={due.tone}>{due.text}</StatusPill>
        </div>

        {open && (
          <RequestSteps
            id={request.id}
            revision={request.revision}
            status={request.status === "received" ? "received" : "in-progress"}
            today={today}
            actions={{ start: startRequest, answer: answerRequest, refuse: refuseRequest }}
          />
        )}

        <Panel title="The request" flush>
          <Facts>
            <Fact label="Asked for">{requestKindNames[request.kind]}</Fact>
            <Fact label="How to reach them">{request.hasContact && request.contactHint ? <RevealContact id={request.id} hint={request.contactHint} action={revealContact} /> : "They didn't leave a contact."}</Fact>
            <Fact label="What they asked">{request.details ?? "Not noted."}</Fact>
            <Fact label="Answer by">{formatDateShort(request.dueOn)}</Fact>
            <Fact label="Who they are">
              {request.identityConfirmedOn ? `Checked ${formatDateShort(request.identityConfirmedOn)}: ${request.identityNote ?? ""}` : "Not checked yet."}
            </Fact>
            {!open && (
              <Fact label={request.status === "refused" ? "Refused" : "Answered"}>
                {`${request.closedOn ? formatDateShort(request.closedOn) : ""}${request.outcome ? `: ${request.outcome}` : ""}`}
              </Fact>
            )}
          </Facts>
          {open && !request.identityConfirmedOn && (
            <div className="border-t border-hairline px-4 py-4 lg:px-5">
              <p className="mb-3 text-sm text-fg-2">Before you release anything about them, check they are who they say: section 23 gives the right of access to a person who has given adequate proof of identity (see below).</p>
              <IdentityForm id={request.id} revision={request.revision} action={confirmIdentity} />
            </div>
          )}
        </Panel>

        <Panel
          title="The guest it's about"
          description={guest ? undefined : "Find their guest record by part of their name, phone number or email."}
          actions={guest ? <UnlinkGuestButton requestId={request.id} action={unlinkGuest} /> : undefined}
          flush={Boolean(guest) || matches.length > 0}
        >
          {guest ? (
            <>
              <Facts>
                <Fact label="Guest record">{guest.guest.name}</Fact>
                <Fact label="Reach them">{[guest.guest.phone && formatPhoneNumber(guest.guest.phone), guest.guest.email].filter(Boolean).join(" · ") || "No contact held."}</Fact>
                <Fact label="Bookings">{guest.bookings.length === 0 ? "None" : `${guest.bookings.length} (kept: financial records)`}</Fact>
                {guest.anonymisedAt && <Fact label="Anonymised">Yes</Fact>}
              </Facts>
              <div className="flex flex-wrap gap-3 border-t border-hairline px-4 py-3 lg:px-5">
                <ButtonLink href={privacyGuestPath(guest.guest.id, request.id)} variant="secondary" size="sm">
                  See what&apos;s held
                </ButtonLink>
                <ButtonAnchor href={privacyGuestExportPath(guest.guest.id)} variant="secondary" size="sm">
                  Download what&apos;s held
                </ButtonAnchor>
              </div>
            </>
          ) : (
            <>
              <form role="search" action={privacyRequestPath(request.id)} className={matches.length > 0 ? "flex gap-2 px-4 pt-3 pb-3 lg:px-5" : "flex gap-2"}>
                <label htmlFor="privacy-guest-search" className="sr-only">
                  Search guests
                </label>
                <input id="privacy-guest-search" name="q" type="search" defaultValue={query} minLength={2} placeholder="Name, phone or email" className={inputClasses("compact", "min-w-0 flex-1")} />
                <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
                  <Search aria-hidden="true" strokeWidth={2} className="size-4" />
                  Search
                </button>
              </form>
              {matches.length > 0 ? (
                <List label="Guests found">
                  {matches.map((match) => (
                    <ListRow key={match.id} trailing={<LinkGuestButton requestId={request.id} guestId={match.id} primary={false} action={linkGuest} />}>
                      <span className="block font-medium break-words text-ink">{match.name}</span>
                      <span className="block text-sm break-all text-fg-2">{[match.phone && formatPhoneNumber(match.phone), match.email].filter(Boolean).join(" · ")}</span>
                    </ListRow>
                  ))}
                </List>
              ) : (
                query && <p className="mt-3 text-sm text-fg-2">{query.length < 2 ? "Type at least two letters or numbers." : "No guest matches. Try part of the name, the last digits of the phone number, or the email."}</p>
              )}
            </>
          )}
        </Panel>

        <Panel title={open ? "Details and notes" : "Notes"}>
          <ChangeRequestForm
            request={{
              id: request.id,
              kind: request.kind,
              receivedOn: request.receivedOn,
              dueOn: request.dueOn,
              details: request.details ?? "",
              notes: request.notes ?? "",
              revision: request.revision,
              open,
            }}
            action={changeRequest}
          />
        </Panel>

        <Panel title="What the Act says about answering">
          <div className="grid gap-2">
            {requestTimeframes.map((point) => (
              <LegalPointText key={point.section} point={point} />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
