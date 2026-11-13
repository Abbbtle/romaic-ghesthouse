import { Mail, MessageCircle, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { bookingStatusNames, bookingStatusTones, sourceName } from "@/components/admin/bookings/booking-labels";
import { EmptyState } from "@/components/admin/empty-state";
import { GuestEditForm } from "@/components/admin/guests/guest-edit-form";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/accounts/access";
import { formatCents } from "@/lib/format/money";
import { formatPhoneNumber, telHref, whatsappLink } from "@/lib/format/phone";
import { stayLabelInList } from "@/lib/inventory/stays";
import { requireDashboardActor } from "@/server/admin-session";
import { allUnits, reservationService } from "@/server/stays";
import { changeGuest } from "../actions";

export const metadata: Metadata = { title: "Guest" };

const contactLink = "inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4";

/** One guest (Pattern: detail): how to reach them, their stays, and their details to change. */
export default async function GuestPage({ params }: PageProps<"/admin/guests/[id]">) {
  const actor = await requireDashboardActor({ permission: "guests:view" });
  const { id } = await params;
  const reservations = reservationService();
  const found = await reservations.guest(actor, id);
  const today = reservations.today();
  if (!found) notFound();
  const { guest, bookings } = found;
  const units = await allUnits();
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  return (
    <>
      <PageHeader
        title={guest.name}
        description={`${bookings.length} ${bookings.length === 1 ? "booking" : "bookings"}`}
        back={{ href: adminRoutes.guests, label: "Guests" }}
        actions={
          can(actor, "bookings:create") ? (
            <ButtonLink href={`${adminRoutes.bookings}/new?guest=${guest.id}`} size="sm" icon={<Plus aria-hidden="true" strokeWidth={2} className="size-4" />}>
              New booking
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid max-w-admin gap-6">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {guest.phone && (
            <>
              <a href={whatsappLink(guest.phone)} target="_blank" rel="noopener noreferrer" className={contactLink}>
                <MessageCircle aria-hidden="true" strokeWidth={1.75} className="size-4" />
                WhatsApp {formatPhoneNumber(guest.phone)}
              </a>
              <a href={telHref(guest.phone)} className={contactLink}>
                <Phone aria-hidden="true" strokeWidth={1.75} className="size-4" />
                Call
              </a>
            </>
          )}
          {guest.email && (
            <a href={`mailto:${guest.email}`} className={`${contactLink} break-all`}>
              <Mail aria-hidden="true" strokeWidth={1.75} className="size-4" />
              {guest.email}
            </a>
          )}
        </div>

        {bookings.length > 0 ? (
          <Panel title="Stays" flush>
            <List>
              {bookings.map((booking) => (
                <ListRow key={booking.id} href={`${adminRoutes.bookings}/${booking.id}`}>
                  <span className="grid gap-0.5">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-bold text-ink">{stayLabelInList(booking.stay, today)}</span>
                      <StatusPill tone={bookingStatusTones[booking.status]}>{bookingStatusNames[booking.status]}</StatusPill>
                    </span>
                    <span className="text-sm text-fg-2">
                      {unitNames.get(booking.unitId) ?? "A unit"} · <span className="font-mono">{booking.ref}</span>
                    </span>
                    <span className="flex justify-between gap-3 text-sm text-fg-2">
                      <span>{sourceName(booking.channel)}</span>
                      <span className="tabular-nums" data-numeric>
                        {formatCents(booking.totalCents)}
                      </span>
                    </span>
                  </span>
                </ListRow>
              ))}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No stays yet">Bookings for this guest appear here.</EmptyState>
        )}

        {can(actor, "guests:manage") ? (
          <Panel title="Details" description="Changes show on every booking of theirs.">
            <GuestEditForm action={changeGuest} guest={{ id: guest.id, name: guest.name, phone: guest.phone ? formatPhoneNumber(guest.phone) : "", email: guest.email ?? "", notes: guest.notes ?? "" }} />
          </Panel>
        ) : (
          guest.notes && (
            <Panel title="Notes">
              <p className="text-base whitespace-pre-line text-ink">{guest.notes}</p>
            </Panel>
          )
        )}
      </div>
    </>
  );
}
