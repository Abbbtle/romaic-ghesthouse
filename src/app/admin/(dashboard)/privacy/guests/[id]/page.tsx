import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { bookingStatusNames, bookingStatusTones, sourceName } from "@/components/admin/bookings/booking-labels";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Fact, Facts } from "@/components/admin/privacy/facts";
import { AnonymiseGuestButton, LinkGuestButton } from "@/components/admin/privacy/guest-actions";
import { privacyGuestExportPath, privacyPaths, privacyRequestPath } from "@/components/admin/privacy/privacy-paths";
import { StatusPill } from "@/components/admin/status-pill";
import { ButtonAnchor } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatDateShort } from "@/lib/format/date-time";
import { formatPhoneNumber } from "@/lib/format/phone";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { stayLabelInList } from "@/lib/inventory/stays";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";
import { allUnits } from "@/server/stays";
import { anonymiseGuest, linkGuest } from "../../actions";

export const metadata: Metadata = { title: "What's held about a guest" };

/**
 * Everything held about one guest (Pattern: detail), for answering a
 * request: their record and bookings, a download of it all (which asks for
 * the password and code again), and anonymising them, which names them
 * before it happens and is refused while a stay is booked or under way.
 * Opened from a request (?request=), it can be linked to it. Owner only
 * (privacy:requests).
 */
export default async function PrivacyGuestPage({ params, searchParams }: PageProps<"/admin/privacy/guests/[id]">) {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { id } = await params;
  const { request: requestParam } = await searchParams;
  const privacy = privacyService();
  const held = await privacy.guestRecord(actor, id);
  if (!held) notFound();
  const requested = typeof requestParam === "string" ? await privacy.request(actor, requestParam) : null;
  const request = requested?.request ?? null;
  const today = privacy.today();
  const units = new Map((await allUnits()).map((unit) => [unit.id, unit.name]));
  const { guest, bookings, anonymisedAt, anonymiseBlocked } = held;

  return (
    <>
      <PageHeader
        title={guest.name}
        description="Everything held about this guest in the booking system."
        back={request ? { href: privacyRequestPath(request.id), label: `Information request from ${request.requesterName}` } : { href: privacyPaths.guests, label: "Find a guest" }}
      />
      <div className="grid max-w-admin gap-6">
        {request && request.guestId !== guest.id && (
          <Notice tone="info" live="off" title={`Is this who ${request.requesterName} is?`} action={<LinkGuestButton requestId={request.id} guestId={guest.id} primary action={linkGuest} />}>
            Link this guest record to their request to keep the two together.
          </Notice>
        )}

        <Panel title="Guest record" flush>
          <Facts>
            <Fact label="Name">{guest.name}</Fact>
            <Fact label="Phone">{guest.phone ? formatPhoneNumber(guest.phone) : "None held"}</Fact>
            <Fact label="Email">{guest.email ?? "None held"}</Fact>
            <Fact label="Notes">{guest.notes ?? "None"}</Fact>
            <Fact label="Added">{formatDateShort(zonedToday(guest.createdAt, businessTimeZone))}</Fact>
            {anonymisedAt && <Fact label="Anonymised">{formatDateShort(zonedToday(anonymisedAt, businessTimeZone))}</Fact>}
          </Facts>
        </Panel>

        <Panel title="Bookings" description="Kept: they're financial records. Anonymising the guest leaves them in place, without the guest's details or notes." flush>
          {bookings.length > 0 ? (
            <List label="Bookings">
              {bookings.map((booking) => (
                <ListRow key={booking.id} trailing={<StatusPill tone={bookingStatusTones[booking.status]}>{bookingStatusNames[booking.status]}</StatusPill>}>
                  <span className="block font-medium text-ink">{stayLabelInList(booking.stay, today)}</span>
                  <span className="block text-sm text-fg-2">
                    {units.get(booking.unitId) ?? "A unit"} · <span className="font-mono">{booking.ref}</span> · {sourceName(booking.channel)}
                  </span>
                  {(booking.notes || booking.serviceNotes) && <span className="block text-sm break-words text-fg-2">Notes: {[booking.serviceNotes, booking.notes].filter(Boolean).join(" · ")}</span>}
                </ListRow>
              ))}
            </List>
          ) : (
            <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">No bookings.</p>
          )}
        </Panel>

        <Panel title="What you can do" flush>
          <ul className="divide-y divide-hairline">
            <ActionRow
              title="Download"
              description="A spreadsheet file of everything above, to check and send them for an access request. You'll be asked for your password and code first if you haven't entered them in the last 15 minutes."
              action={
                <ButtonAnchor href={privacyGuestExportPath(guest.id)} variant="secondary" size="sm" icon={<Download aria-hidden="true" />}>
                  Download what&apos;s held
                </ButtonAnchor>
              }
            />
            <ActionRow
              title="Anonymise"
              description="For a deletion request, or when they ask you to stop holding their details."
              note={anonymiseBlocked}
              action={anonymiseBlocked ? null : <AnonymiseGuestButton guestId={guest.id} name={guest.name} requestId={request?.id ?? null} action={anonymiseGuest} />}
            />
          </ul>
        </Panel>
      </div>
    </>
  );
}

/** One thing that can be done with the guest's record, as a row: what it is and when to use it, with its button opposite (below it on phones), or why it can't be done now. */
function ActionRow({ title, description, note, action }: { title: string; description: string; note?: string | null; action: ReactNode }) {
  return (
    <li className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 lg:px-5">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-fg-2">{description}</p>
        {note && <p className="mt-2 text-sm font-medium text-ink">{note}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}
