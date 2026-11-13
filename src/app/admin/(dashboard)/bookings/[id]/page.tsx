import { Mail, MessageCircle, Phone, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { adminRoutes } from "@/components/admin/admin-routes";
import { BookingActions } from "@/components/admin/bookings/booking-actions";
import { BookingEditForm } from "@/components/admin/bookings/booking-edit-form";
import { bookingStatusNames, bookingStatusTones, sourceName } from "@/components/admin/bookings/booking-labels";
import { guestMessages } from "@/components/admin/bookings/guest-messages";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { Notice } from "@/components/ui/notice";
import { can } from "@/lib/accounts/access";
import { centsForInput, formatCents } from "@/lib/format/money";
import { formatPhoneNumber, telHref, whatsappLink } from "@/lib/format/phone";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import { holdsNights } from "@/lib/reservations/reservations";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { getSiteContent } from "@/server/site-content";
import { allUnits, reservationService } from "@/server/stays";
import { cancelBooking, changeBooking, checkInBooking, checkOutBooking, markNoShow } from "../actions";

export const metadata: Metadata = { title: "Booking" };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold text-fg-3">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/**
 * One booking (Pattern: detail): the guest and how to reach them, the stay,
 * the money in short (payments and invoices on their own page), what can
 * happen next, the WhatsApp messages, and the edit form. For the owner and
 * sales (bookings:view); staff see stays on Today instead.
 */
export default async function BookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const actor = await requireDashboardActor({ permission: "bookings:view" });
  const { id } = await params;
  const { notice } = await searchParams;
  const reservations = reservationService();
  const booking = await reservations.booking(actor, id);
  if (!booking) notFound();
  const [units, content] = await Promise.all([allUnits(), getSiteContent()]);
  const apartmentNames = new Map(content.apartments.items.map((item) => [item.slug, item.name]));
  const unit = units.find((candidate) => candidate.id === booking.unitId);
  const apartmentName = apartmentNames.get(booking.apartment) ?? booking.apartment;
  const today = reservations.today();
  const guests = booking.adults + booking.children;
  const editable = holdsNights(booking.status) && booking.status !== "checked-out" && can(actor, "bookings:change");
  const messages = guestMessages(booking, content, apartmentName);
  const unitOptions = units
    .filter((candidate) => candidate.active && apartmentNames.has(candidate.apartment))
    .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${apartmentNames.get(candidate.apartment)})` }));

  return (
    <>
      <PageHeader
        title={`${booking.guest.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold tracking-wider">{booking.ref}</span>
            <StatusPill tone={bookingStatusTones[booking.status]}>{bookingStatusNames[booking.status]}</StatusPill>
          </span>
        }
        back={{ href: adminRoutes.bookings, label: "Bookings" }}
      />
      <div className="grid max-w-admin gap-6">
        {notice === "created" && <Notice tone="success">Booking made. Its nights are now closed in {unit?.name ?? "the unit"}.</Notice>}

        <BookingActions
          id={booking.id}
          guestName={booking.guest.name.split(" ")[0] ?? booking.guest.name}
          can={{
            checkIn: can(actor, "stays:check-in-out") && booking.status === "confirmed" && booking.stay.arrive <= today && booking.stay.leave > today,
            checkOut: can(actor, "stays:check-in-out") && booking.status === "checked-in",
            noShow: can(actor, "stays:check-in-out") && booking.status === "confirmed" && booking.stay.arrive <= today,
            cancel: can(actor, "bookings:cancel") && booking.status === "confirmed",
          }}
          actions={{ checkIn: checkInBooking, checkOut: checkOutBooking, noShow: markNoShow, cancel: cancelBooking }}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="The stay">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Room">
                {unit?.name ?? "A unit"} <span className="text-fg-2">({apartmentName})</span>
              </Fact>
              <Fact label="Nights">{stayLabel(booking.stay)}</Fact>
              <Fact label="Guests">
                {guests} ({booking.adults} {booking.adults === 1 ? "adult" : "adults"}
                {booking.children > 0 && `, ${booking.children} ${booking.children === 1 ? "child" : "children"}`})
              </Fact>
              <Fact label="From">
                {sourceName(booking.channel)}
                {booking.externalRef && <span className="text-fg-2"> · {booking.externalRef}</span>}
              </Fact>
              {booking.serviceNotes && <Fact label="For the team">{booking.serviceNotes}</Fact>}
              {booking.notes && <Fact label="Private">{booking.notes}</Fact>}
              <Fact label="Made">{capitalised(whenLabel(booking.createdAt, clock.now(), businessTimeZone))}</Fact>
              {booking.requestId && (
                <Fact label="From a request">
                  <Link href={`${adminRoutes.requests}?list=handled`} className="inline-flex min-h-6 items-center font-bold text-link underline underline-offset-4">
                    See requests
                  </Link>
                </Fact>
              )}
            </dl>
          </Panel>

          <Panel title="The guest">
            <dl className="grid gap-4">
              <Fact label="Name">
                {can(actor, "guests:view") ? (
                  <Link href={`${adminRoutes.guests}/${booking.guest.id}`} className="inline-flex min-h-6 items-center font-bold text-link underline underline-offset-4">
                    {booking.guest.name}
                  </Link>
                ) : (
                  booking.guest.name
                )}
              </Fact>
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {booking.guest.phone && (
                <>
                  <a href={whatsappLink(booking.guest.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
                    <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-4" />
                    WhatsApp {formatPhoneNumber(booking.guest.phone)}
                  </a>
                  <a href={telHref(booking.guest.phone)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
                    <Phone aria-hidden="true" strokeWidth={1.75} className="size-4" />
                    Call
                  </a>
                </>
              )}
              {booking.guest.email && (
                <a href={`mailto:${booking.guest.email}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold break-all text-link underline underline-offset-4">
                  <Mail aria-hidden="true" strokeWidth={1.75} className="size-4" />
                  {booking.guest.email}
                </a>
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Money"
          actions={
            can(actor, "booking-money:manage") ? (
              <Link href={`${adminRoutes.bookings}/${booking.id}/money`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
                <Wallet aria-hidden="true" strokeWidth={1.75} className="size-4" />
                Payments and invoices
              </Link>
            ) : undefined
          }
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Total for the stay">
              <span data-numeric>{formatCents(booking.totalCents)}</span>
            </Fact>
            <Fact label="Deposit due">
              <span data-numeric>{formatCents(booking.depositDueCents)}</span>
            </Fact>
          </dl>
        </Panel>

        {booking.guest.phone && (booking.status === "confirmed" || booking.status === "checked-in") && (
          <Panel title="WhatsApp messages" description="Opens WhatsApp with the message filled in, for you to check and send. Nothing is sent by itself.">
            <ul className="grid gap-4">
              {messages.map((message) => (
                <li key={message.key} className="grid gap-2 border-b border-hairline pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-bold text-ink">{message.label}</p>
                  <p className="text-sm whitespace-pre-line text-fg-2">{message.text}</p>
                  {message.href && (
                    <a href={message.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm font-bold text-link underline underline-offset-4">
                      <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-4" />
                      Open in WhatsApp
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {editable && (
          <Panel title="Change the booking" description="Moving it to another unit or other dates checks those nights are free first.">
            <BookingEditForm
              action={changeBooking}
              units={unitOptions}
              booking={{
                id: booking.id,
                revision: booking.revision,
                unitId: booking.unitId,
                arrive: booking.stay.arrive,
                leave: booking.stay.leave,
                adults: booking.adults,
                children: booking.children,
                total: centsForInput(booking.totalCents),
                depositDue: centsForInput(booking.depositDueCents),
                channel: booking.channel,
                externalRef: booking.externalRef ?? "",
                serviceNotes: booking.serviceNotes ?? "",
                notes: booking.notes ?? "",
              }}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
